import { safeStorage, shell } from "electron";
import Store from "electron-store";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

export const KICK_REDIRECT_URI = "http://localhost:17654/oauth/kick/callback";
export const KICK_DEVELOPER_URL = "https://dev.kick.com/";
const AUTHORIZE_URL = "https://id.kick.com/oauth/authorize";
const TOKEN_URL = "https://id.kick.com/oauth/token";
const API_URL = "https://api.kick.com";
const SCOPES = ["user:read", "channel:read", "chat:write"];

type Credentials = { clientId: string; clientSecret: string };
type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
};
type SecretStore = { credentials?: string; tokens?: string };
export type KickPublicState = {
  configured: boolean;
  status: "disconnected" | "connecting" | "connected" | "error";
  displayName?: string;
  userId?: string;
  avatarUrl?: string;
  scopes?: string[];
  expiresAt?: string;
  detail?: string;
};

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
export function kickChatBody(content: string) {
  return { content, type: "user" as const };
}

export class KickAuth {
  private readonly secrets = new Store<SecretStore>({ name: "kick-secrets" });
  private refreshPromise?: Promise<Tokens>;

  private encrypt(value: unknown) {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows no permite cifrar las credenciales en este momento.");
    return safeStorage.encryptString(JSON.stringify(value)).toString("base64");
  }
  private decrypt<T>(key: keyof SecretStore): T | undefined {
    const value = this.secrets.get(key);
    if (!value) return;
    try {
      return JSON.parse(
        safeStorage.decryptString(Buffer.from(value, "base64")),
      ) as T;
    } catch {
      return;
    }
  }
  configured() {
    const value = this.decrypt<Credentials>("credentials");
    return Boolean(value?.clientId && value.clientSecret);
  }
  saveCredentials(clientId: string, clientSecret: string) {
    const credentials = {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    };
    if (!/^[^\s]{8,200}$/.test(credentials.clientId) || !credentials.clientSecret)
      throw new Error("Completa un Client ID y un Client Secret válidos.");
    this.secrets.set("credentials", this.encrypt(credentials));
    this.secrets.delete("tokens");
  }
  clearTokens() {
    this.secrets.delete("tokens");
  }
  private async tokenRequest(body: URLSearchParams) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error(`Kick rechazó OAuth (${response.status}).`);
    const json = (await response.json()) as {
      access_token: string; refresh_token: string; expires_in: number; scope?: string;
    };
    const tokens: Tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      scopes: json.scope?.split(/\s+/).filter(Boolean) ?? SCOPES,
    };
    this.secrets.set("tokens", this.encrypt(tokens));
    return tokens;
  }
  private async tokens() {
    const value = this.decrypt<Tokens>("tokens");
    if (!value) throw new Error("Conecta primero tu cuenta de Kick.");
    if (new Date(value.expiresAt).getTime() > Date.now() + 60_000) return value;
    if (this.refreshPromise) return this.refreshPromise;
    const credentials = this.decrypt<Credentials>("credentials");
    if (!credentials) throw new Error("Configura primero la aplicación de Kick.");
    this.refreshPromise = this.tokenRequest(new URLSearchParams({
      grant_type: "refresh_token", refresh_token: value.refreshToken,
      client_id: credentials.clientId, client_secret: credentials.clientSecret,
    })).finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }
  async authorizedFetch(path: string, init: RequestInit = {}) {
    const tokens = await this.tokens();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${tokens.accessToken}` },
    });
  }
  async identity(): Promise<KickPublicState> {
    const tokens = await this.tokens();
    const [users, introspect] = await Promise.all([
      this.authorizedFetch("/public/v1/users"),
      this.authorizedFetch("/public/v1/token/introspect", { method: "POST" }),
    ]);
    if (!users.ok || !introspect.ok) throw new Error("Kick no pudo validar la cuenta.");
    const userJson = (await users.json()) as { data?: Array<{ user_id: number; name: string; profile_picture?: string }> };
    const introspectJson = (await introspect.json()) as { data?: { active?: boolean; scope?: string; exp?: number } };
    const user = userJson.data?.[0];
    const scopes = introspectJson.data?.scope?.split(/\s+/).filter(Boolean) ?? tokens.scopes;
    if (!introspectJson.data?.active || !scopes.includes("chat:write"))
      throw new Error("La autorización de Kick no incluye chat:write.");
    return { configured: true, status: "connected", displayName: user?.name,
      userId: user ? String(user.user_id) : undefined, avatarUrl: user?.profile_picture,
      scopes, expiresAt: introspectJson.data.exp ? new Date(introspectJson.data.exp * 1000).toISOString() : tokens.expiresAt };
  }
  async connect() {
    const credentials = this.decrypt<Credentials>("credentials");
    if (!credentials) throw new Error("Configura primero la aplicación de Kick.");
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(64).toString("base64url");
    const url = new URL(AUTHORIZE_URL);
    Object.entries({ client_id: credentials.clientId, response_type: "code",
      redirect_uri: KICK_REDIRECT_URI, state, scope: SCOPES.join(" "),
      code_challenge: pkceChallenge(verifier), code_challenge_method: "S256" })
      .forEach(([key, value]) => url.searchParams.set(key, value));
    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => { server.close(); reject(new Error("La autorización de Kick ha caducado.")); }, 5 * 60_000);
      const server = createServer((request, response) => {
        const callback = new URL(request.url ?? "/", KICK_REDIRECT_URI);
        if (callback.pathname !== "/oauth/kick/callback") { response.writeHead(404).end(); return; }
        const received = Buffer.from(callback.searchParams.get("state") ?? "");
        const expected = Buffer.from(state);
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
          response.writeHead(400).end("Estado OAuth no válido."); return;
        }
        const value = callback.searchParams.get("code");
        if (!value) { response.writeHead(400).end("Kick no devolvió un código."); return; }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end("<h1>Kick conectado</h1><p>Ya puedes volver a Apoya a tu Streamer.</p>");
        clearTimeout(timeout); server.close(); resolve(value);
      });
      server.on("error", () => { clearTimeout(timeout); reject(new Error("El puerto 17654 está ocupado.")); });
      server.listen(17654, "localhost", () => void shell.openExternal(url.toString()).catch(reject));
    });
    await this.tokenRequest(new URLSearchParams({ grant_type: "authorization_code",
      code, client_id: credentials.clientId, client_secret: credentials.clientSecret,
      redirect_uri: KICK_REDIRECT_URI, code_verifier: verifier }));
    return this.identity();
  }
  async send(content: string) {
    const response = await this.authorizedFetch("/public/v1/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kickChatBody(content)),
    });
    if (!response.ok) throw new Error(`Kick rechazó el mensaje (${response.status}).`);
  }
  async resolveChannel(slug: string) {
    const response = await this.authorizedFetch(
      `/public/v1/channels?slug=${encodeURIComponent(slug)}`,
    );
    if (!response.ok) throw new Error("Kick no pudo resolver el canal.");
    const json = (await response.json()) as { data?: Array<{ broadcaster_user_id: number; slug: string }> };
    const channel = json.data?.[0];
    if (!channel) throw new Error("No se encontró ese canal de Kick.");
    return { externalId: String(channel.broadcaster_user_id), login: channel.slug, displayName: channel.slug };
  }
}
