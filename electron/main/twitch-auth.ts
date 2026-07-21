import { safeStorage, shell } from "electron";
import Store from "electron-store";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  assertAuthenticatedSender,
  scopesForAccount,
} from "../../src/domain/twitch-account";
import type { BotConnection, TwitchAccountType } from "../../src/domain/types";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
  accountType?: TwitchAccountType;
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

export function migrateStoredTokens(
  tokens: StoredTokens,
): StoredTokens & { accountType: TwitchAccountType } {
  return { ...tokens, accountType: tokens.accountType ?? "bot" };
}
export function shouldRefresh(expiresAt: string, now = Date.now()) {
  return new Date(expiresAt).getTime() < now + 60_000;
}
export function shouldClearTokensOnTypeChange(current: TwitchAccountType | undefined, next: TwitchAccountType) { return Boolean(current && current !== next) }
export function deleteStoredTokens(store: { delete(key: "tokens"): unknown }) { store.delete("tokens") }
export function refreshedTokens(previous: StoredTokens & { accountType: TwitchAccountType }, response: { access_token: string; refresh_token?: string; expires_in: number; scope: string[] }, now = Date.now()) {
  return { accessToken: response.access_token, refreshToken: response.refresh_token ?? previous.refreshToken, expiresAt: new Date(now + response.expires_in * 1000).toISOString(), scopes: response.scope, accountType: previous.accountType };
}

export class TwitchAuth {
  private secrets = new Store<Secrets>({ name: "secure-tokens" });
  constructor(private clientId: () => string | undefined) {}
  private save(tokens: StoredTokens) {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        "El almacenamiento seguro del sistema no está disponible.",
      );
    this.secrets.set(
      "tokens",
      safeStorage.encryptString(JSON.stringify(tokens)).toString("base64"),
    );
  }
  clear() { deleteStoredTokens(this.secrets) }
  hasTokens() {
    return Boolean(this.secrets.get("tokens"));
  }
  private read():
    (StoredTokens & { accountType: TwitchAccountType }) | undefined {
    const value = this.secrets.get("tokens");
    if (!value) return;
    try {
      return migrateStoredTokens(
        JSON.parse(
          safeStorage.decryptString(Buffer.from(value, "base64")),
        ) as StoredTokens,
      );
    } catch {
      return undefined;
    }
  }
  currentType(): TwitchAccountType | undefined {
    return this.read()?.accountType;
  }
  async connect(accountType: TwitchAccountType) {
    const clientId = this.clientId()?.trim();
    if (!clientId) throw new Error("Configura primero el Client ID de Twitch.");
    if (this.hasTokens() && shouldClearTokensOnTypeChange(this.currentType(), accountType)) this.clear();
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
      }, 180_000);
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
            ? "Cuenta de Twitch conectada. Ya puedes cerrar esta ventana."
            : "No se autorizó la cuenta de Twitch.",
        );
        if (value) {
          clearTimeout(timeout);
          server.close();
          resolve(value);
        }
      });
      const url = new URL("https://id.twitch.tv/oauth2/authorize");
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: scopesForAccount(accountType).join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        force_verify: "true",
      }).toString();
      void shell.openExternal(url.toString());
    });
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code_verifier: verifier,
      }),
    });
    if (!response.ok)
      throw await this.responseError(
        response,
        "Twitch rechazó el intercambio OAuth.",
      );
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
      accountType,
    });
    return this.validate();
  }
  private async refresh(
    tokens: StoredTokens & { accountType: TwitchAccountType },
  ) {
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
      throw await this.responseError(
        response,
        "El token de Twitch ha caducado.",
      );
    }
    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string[];
    };
    const next = refreshedTokens(tokens, json);
    this.save(next);
    return next;
  }
  async accessToken() {
    let tokens = this.read();
    if (!tokens)
      throw new TwitchApiError(401, "Cuenta de Twitch desconectada.");
    if (shouldRefresh(tokens.expiresAt)) tokens = await this.refresh(tokens);
    return tokens.accessToken;
  }
  async validate(): Promise<BotConnection> {
    const tokens = this.read();
    if (!tokens)
      throw new TwitchApiError(401, "Cuenta de Twitch desconectada.");
    const token = await this.accessToken();
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (response.status === 401) {
      this.clear();
      throw await this.responseError(
        response,
        "El token de Twitch ha caducado.",
      );
    }
    if (!response.ok)
      throw await this.responseError(
        response,
        "No se pudo validar la cuenta de Twitch.",
      );
    const data = (await response.json()) as {
      user_id: string;
      login: string;
      expires_in: number;
      scopes: string[];
    };
    const required = scopesForAccount(tokens.accountType);
    const missing = required.filter((scope) => !data.scopes.includes(scope));
    if (missing.length)
      throw new TwitchApiError(
        403,
        `Permisos insuficientes: ${missing.join(", ")}`,
      );
    const user = await this.authenticatedUser(token, data.user_id);
    return {
      status: "connected",
      accountType: tokens.accountType,
      userId: data.user_id,
      displayName: user.display_name || data.login,
      avatarUrl: user.profile_image_url,
      scopes: data.scopes,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }
  private async authenticatedUser(token: string, userId: string) {
    const response = await fetch(
      `https://api.twitch.tv/helix/users?id=${encodeURIComponent(userId)}`,
      {
        headers: {
          "Client-Id": this.clientId() ?? "",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok)
      throw await this.responseError(
        response,
        "No se pudo obtener la cuenta autenticada.",
      );
    const json = (await response.json()) as {
      data: { id: string; display_name: string; profile_image_url: string }[];
    };
    const user = json.data[0];
    if (!user || user.id !== userId)
      throw new TwitchApiError(
        401,
        "La cuenta autenticada no coincide con el token.",
      );
    return user;
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
      throw await this.responseError(response, "No se pudo resolver el canal.");
    const data = (await response.json()) as { data: { id: string }[] };
    if (!data.data[0]) throw new TwitchApiError(404, "Canal no encontrado.");
    return data.data[0].id;
  }
  async send(broadcasterId: string, message: string) {
    const connection = await this.validate();
    const token = await this.accessToken();
    const senderId = connection.userId ?? "";
    assertAuthenticatedSender(connection.userId ?? "", senderId);
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
      throw await this.responseError(response, "No se pudo enviar el mensaje.");
    const json = (await response.json()) as {
      data?: { is_sent: boolean; drop_reason?: { message: string } }[];
    };
    if (!json.data?.[0]?.is_sent)
      throw new TwitchApiError(
        403,
        json.data?.[0]?.drop_reason?.message ?? "Twitch rechazó el mensaje.",
      );
  }
  private async responseError(response: Response, fallback: string) {
    let message = fallback;
    try {
      const body = (await response.clone().json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* respuesta sin JSON */
    }
    return new TwitchApiError(
      response.status,
      message,
      Number(response.headers.get("retry-after") ?? 0),
    );
  }
}
