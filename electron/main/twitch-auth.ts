import { safeStorage, shell } from "electron";
import Store from "electron-store";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
export const TWITCH_SCOPES = ["user:write:chat", "user:bot"];
type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
};
type Secrets = { tokens?: string };
export class TwitchApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export class TwitchAuth {
  private secrets = new Store<Secrets>({ name: "secure-tokens" });
  constructor(private clientId: () => string | undefined) {}
  private save(tokens: Tokens) {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        "El almacenamiento seguro del sistema no está disponible.",
      );
    this.secrets.set(
      "tokens",
      safeStorage.encryptString(JSON.stringify(tokens)).toString("base64"),
    );
  }
  clear() {
    this.secrets.delete("tokens");
  }
  private read(): Tokens | undefined {
    const value = this.secrets.get("tokens");
    if (!value) return;
    try {
      return JSON.parse(
        safeStorage.decryptString(Buffer.from(value, "base64")),
      ) as Tokens;
    } catch {
      return undefined;
    }
  }
  async connect() {
    const clientId = this.clientId()?.trim();
    if (!clientId) throw new Error("Configura primero el Client ID de Twitch.");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(24).toString("hex");
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No se pudo iniciar el callback OAuth.");
    const redirect = `http://localhost:${address.port}/oauth/twitch`;
    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error("La conexión OAuth agotó el tiempo."));
      }, 180000);
      server.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", redirect);
        if (url.pathname !== "/oauth/twitch") return;
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400);
          res.end("Estado OAuth no válido.");
          return;
        }
        const value = url.searchParams.get("code");
        res.writeHead(value ? 200 : 400, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        res.end(
          value
            ? "Cuenta bot conectada. Ya puedes cerrar esta ventana."
            : "No se autorizó la cuenta bot.",
        );
        if (value) {
          clearTimeout(timeout);
          server.close();
          resolve(value);
        }
      });
      const auth = new URL("https://id.twitch.tv/oauth2/authorize");
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: TWITCH_SCOPES.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        force_verify: "true",
      }).toString();
      void shell.openExternal(auth.toString());
    });
    const body = new URLSearchParams({
      client_id: clientId,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirect,
      code_verifier: verifier,
    });
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error("Twitch rechazó el intercambio OAuth.");
    const json = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string[];
    };
    this.save({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      scopes: json.scope,
    });
    return this.validate();
  }
  private async refresh(tokens: Tokens) {
    const clientId = this.clientId();
    if (!clientId) throw new TwitchApiError(401, "Falta Client ID.");
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: clientId,
      }),
    });
    if (!response.ok) {
      this.clear();
      throw new TwitchApiError(401, "El token de la cuenta bot ha caducado.");
    }
    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string[];
    };
    const next = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? tokens.refreshToken,
      expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      scopes: json.scope,
    };
    this.save(next);
    return next;
  }
  async accessToken() {
    let tokens = this.read();
    if (!tokens) throw new TwitchApiError(401, "Cuenta bot desconectada.");
    if (new Date(tokens.expiresAt).getTime() < Date.now() + 60000)
      tokens = await this.refresh(tokens);
    return tokens.accessToken;
  }
  async validate() {
    const token = await this.accessToken();
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (response.status === 401) {
      this.clear();
      throw new TwitchApiError(401, "El token de la cuenta bot ha caducado.");
    }
    if (!response.ok)
      throw new TwitchApiError(
        response.status,
        "No se pudo validar la cuenta bot.",
      );
    const data = (await response.json()) as {
      user_id: string;
      login: string;
      expires_in: number;
      scopes: string[];
    };
    const missing = TWITCH_SCOPES.filter((x) => !data.scopes.includes(x));
    if (missing.length)
      throw new TwitchApiError(
        403,
        `Permisos insuficientes: ${missing.join(", ")}`,
      );
    return {
      status: "connected" as const,
      userId: data.user_id,
      displayName: data.login,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }
  async resolveBroadcaster(login: string) {
    const token = await this.accessToken();
    const response = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      {
        headers: {
          "Client-Id": this.clientId() ?? "",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok)
      throw new TwitchApiError(
        response.status,
        "No se pudo resolver el canal.",
      );
    const data = (await response.json()) as { data: { id: string }[] };
    if (!data.data[0]) throw new TwitchApiError(404, "Canal no encontrado.");
    return data.data[0].id;
  }
  async send(broadcasterId: string, senderId: string, message: string) {
    const token = await this.accessToken();
    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        "Client-Id": this.clientId() ?? "",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_id: broadcasterId,
        sender_id: senderId,
        message,
      }),
    });
    if (!response.ok)
      throw new TwitchApiError(
        response.status,
        response.status === 429
          ? "Límite de Twitch alcanzado."
          : response.status === 403
            ? "El bot no tiene permiso en este canal."
            : "No se pudo enviar el mensaje.",
        Number(response.headers.get("retry-after") ?? 0),
      );
    const json = (await response.json()) as {
      data?: { is_sent: boolean; drop_reason?: { message: string } }[];
    };
    if (!json.data?.[0]?.is_sent)
      throw new TwitchApiError(
        403,
        json.data?.[0]?.drop_reason?.message ?? "Twitch rechazó el mensaje.",
      );
  }
}
