import { safeStorage, shell } from "electron";
import Store from "electron-store";
import {
  assertAuthenticatedSender,
  scopesForAccount,
} from "../../src/domain/twitch-account";
import type {
  BotConnection,
  DeviceAuthPublic,
  TwitchAccountType,
} from "../../src/domain/types";
import type { LiveResult } from "../../src/domain/monitor";

export const TWITCH_DEVICE_ENDPOINT = "https://id.twitch.tv/oauth2/device";
export const TWITCH_TOKEN_ENDPOINT = "https://id.twitch.tv/oauth2/token";
export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
  accountType?: TwitchAccountType;
  clientId?: string;
};
type Secrets = { tokens?: string };
type PendingDevice = {
  deviceCode: string;
  accountType: TwitchAccountType;
  expiresAt: number;
  intervalMs: number;
  controller: AbortController;
};
export class TwitchApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
    public category: "temporary" | "reconnect-required" | "permissions" | "storage" = status === 401 ? "reconnect-required" : status === 403 ? "permissions" : "temporary",
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
export function shouldClearTokensOnTypeChange(
  current: TwitchAccountType | undefined,
  next: TwitchAccountType,
) {
  return Boolean(current && current !== next);
}
export function deleteStoredTokens(store: { delete(key: "tokens"): unknown }) {
  store.delete("tokens");
}
export function refreshedTokens(
  previous: StoredTokens & { accountType: TwitchAccountType },
  response: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string[];
  },
  now = Date.now(),
) {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previous.refreshToken,
    expiresAt: new Date(now + response.expires_in * 1000).toISOString(),
    scopes: response.scope,
    accountType: previous.accountType,
  };
}
export function deviceRequestBody(clientId: string, type: TwitchAccountType) {
  return new URLSearchParams({
    client_id: clientId,
    scopes: scopesForAccount(type).join(" "),
  });
}
export function deviceTokenBody(clientId: string, deviceCode: string) {
  return new URLSearchParams({
    client_id: clientId,
    device_code: deviceCode,
    grant_type: DEVICE_GRANT_TYPE,
  });
}
export function nextPollingInterval(currentMs: number, error: string) {
  return error === "slow_down" ? currentMs + 5_000 : currentMs;
}
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Cancelado", "AbortError"));
      },
      { once: true },
    );
  });

export class TwitchAuth {
  private secrets = new Store<Secrets>({ name: "secure-tokens" });
  private pending?: PendingDevice;
  private refreshPromise?: Promise<StoredTokens & { accountType: TwitchAccountType }>;
  private lastValidation?: string;
  private lastRefreshResult?: string;
  private lastRefreshAt?: string;
  private lastErrorStatus?: number;
  private lastErrorCategory?: string;
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
    if (!this.read()) throw new TwitchApiError(0, "No se pudo verificar la sesión cifrada.", undefined, "storage");
  }
  clear() {
    this.cancelDevice();
    deleteStoredTokens(this.secrets);
  }
  hasTokens() {
    return Boolean(this.secrets.get("tokens"));
  }
  needsRefresh() {
    try {
      const tokens = this.read();
      return Boolean(tokens && shouldRefresh(tokens.expiresAt));
    } catch {
      return false;
    }
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
      throw new TwitchApiError(0, "No se pudo acceder a la sesión guardada.", undefined, "storage");
    }
  }
  currentType() {
    return this.read()?.accountType;
  }
  async beginDevice(accountType: TwitchAccountType): Promise<DeviceAuthPublic> {
    this.cancelDevice();
    const clientId = this.clientId()?.trim();
    if (!clientId) throw new Error("Client ID vacío.");
    if (
      this.hasTokens() &&
      shouldClearTokensOnTypeChange(this.currentType(), accountType)
    )
      this.clear();
    const controller = new AbortController();
    const response = await fetch(TWITCH_DEVICE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: deviceRequestBody(clientId, accountType),
      signal: controller.signal,
    });
    if (!response.ok)
      throw await this.responseError(
        response,
        "Twitch no pudo iniciar la autorización del dispositivo.",
      );
    const data = (await response.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };
    const expiresAt = Date.now() + data.expires_in * 1000;
    this.pending = {
      deviceCode: data.device_code,
      accountType,
      expiresAt,
      intervalMs: Math.max(1, data.interval) * 1000,
      controller,
    };
    return {
      status: "waiting",
      accountType,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresAt: new Date(expiresAt).toISOString(),
      intervalSeconds: Math.max(1, data.interval),
    };
  }
  async openDeviceVerification(url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("twitch.tv"))
      throw new Error("URL de Twitch no válida.");
    await shell.openExternal(parsed.toString());
  }
  async pollDevice(
    onStatus: (status: DeviceAuthPublic) => void,
  ): Promise<BotConnection> {
    const pending = this.pending;
    const clientId = this.clientId()?.trim();
    if (!pending || !clientId)
      throw new Error("No hay una conexión pendiente.");
    try {
      while (Date.now() < pending.expiresAt) {
        await wait(pending.intervalMs, pending.controller.signal);
        const response = await fetch(TWITCH_TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: deviceTokenBody(clientId, pending.deviceCode),
          signal: pending.controller.signal,
        });
        const data = (await response.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string[];
          message?: string;
          error?: string;
        };
        if (
          response.ok &&
          data.access_token &&
          data.refresh_token &&
          data.expires_in
        ) {
          this.save({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(
              Date.now() + data.expires_in * 1000,
            ).toISOString(),
            scopes: data.scope ?? [],
            accountType: pending.accountType,
            clientId,
          });
          this.pending = undefined;
          return await this.validate();
        }
        const code = data.error ?? data.message ?? "authorization_pending";
        if (/pending/i.test(code)) {
          onStatus({
            status: "waiting",
            accountType: pending.accountType,
            expiresAt: new Date(pending.expiresAt).toISOString(),
          });
          continue;
        }
        if (/slow_down/i.test(code)) {
          pending.intervalMs = nextPollingInterval(
            pending.intervalMs,
            "slow_down",
          );
          onStatus({
            status: "slow-down",
            accountType: pending.accountType,
            expiresAt: new Date(pending.expiresAt).toISOString(),
            intervalSeconds: pending.intervalMs / 1000,
          });
          continue;
        }
        if (/denied|declined|access_denied/i.test(code))
          throw new Error("Acceso denegado por el usuario.");
        if (/expired/i.test(code))
          throw new Error("El código de Twitch ha caducado.");
        throw new Error(data.message ?? "Twitch rechazó la autorización.");
      }
      throw new Error("El código de Twitch ha caducado.");
    } finally {
      if (this.pending === pending) {
        pending.controller.abort();
        this.pending = undefined;
      }
    }
  }
  cancelDevice() {
    this.pending?.controller.abort();
    this.pending = undefined;
  }
  private async performRefresh(
    tokens: StoredTokens & { accountType: TwitchAccountType },
  ) {
    const clientId = this.clientId()?.trim();
    if (!clientId) throw new TwitchApiError(401, "Falta Client ID.");
    if (tokens.clientId && tokens.clientId !== clientId)
      throw new TwitchApiError(401, "El Client ID cambió; es necesario volver a conectar Twitch.");
    const response = await fetch(TWITCH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: clientId,
      }),
    });
    if (!response.ok) {
      const error = await this.responseError(
        response,
        "El token de Twitch ha caducado.",
      );
      this.lastErrorStatus = error.status;
      this.lastErrorCategory = error.category;
      this.lastRefreshResult = error.category === "reconnect-required" ? "reconnect-required" : "temporary-failure";
      throw error;
    }
    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string[];
    };
    const next = { ...refreshedTokens(tokens, json), clientId };
    this.save(next);
    const verified = this.read();
    if (!verified || verified.accessToken !== next.accessToken || verified.refreshToken !== next.refreshToken)
      throw new TwitchApiError(0, "No se pudo guardar la sesión renovada.", undefined, "storage");
    this.lastRefreshResult = "success";
    this.lastRefreshAt = new Date().toISOString();
    return next;
  }
  private refresh(tokens: StoredTokens & { accountType: TwitchAccountType }) {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh(tokens).finally(() => {
        this.refreshPromise = undefined;
      });
    }
    return this.refreshPromise;
  }
  async accessToken() {
    let tokens = this.read();
    if (!tokens)
      throw new TwitchApiError(401, "Cuenta de Twitch desconectada.");
    if (shouldRefresh(tokens.expiresAt)) tokens = await this.refresh(tokens);
    return tokens.accessToken;
  }
  private async forceRefresh() {
    const tokens = this.read();
    if (!tokens) throw new TwitchApiError(401, "Cuenta de Twitch desconectada.");
    return (await this.refresh(tokens)).accessToken;
  }
  private async authenticatedFetch(input: string, init: RequestInit = {}) {
    const request = async (token: string) => fetch(input, { ...init, headers: { ...init.headers, "Client-Id": this.clientId()?.trim() ?? "", Authorization: `Bearer ${token}` } });
    let response = await request(await this.accessToken());
    if (response.status === 401) response = await request(await this.forceRefresh());
    return response;
  }
  async validate(): Promise<BotConnection> {
    const tokens = this.read();
    if (!tokens)
      throw new TwitchApiError(401, "Cuenta de Twitch desconectada.");
    let token = await this.accessToken();
    const request = (value: string) => fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${value}` } });
    let response = await request(token);
    if (response.status === 401) {
      token = await this.forceRefresh();
      response = await request(token);
      if (response.status === 401) throw new TwitchApiError(401, "Es necesario volver a conectar Twitch.");
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
    const missing = scopesForAccount(tokens.accountType).filter(
      (scope) => !data.scopes.includes(scope),
    );
    if (missing.length)
      throw new TwitchApiError(
        403,
        `Permisos insuficientes: ${missing.join(", ")}`,
      );
    const user = await this.authenticatedUser(data.user_id);
    this.lastValidation = new Date().toISOString();
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
  private async authenticatedUser(userId: string) {
    const response = await this.authenticatedFetch(
      `https://api.twitch.tv/helix/users?id=${encodeURIComponent(userId)}`,
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
    return (await this.resolveChannel(login)).id;
  }
  async resolveChannel(login: string) {
    const response = await this.authenticatedFetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    );
    if (!response.ok)
      throw await this.responseError(response, "No se pudo resolver el canal.");
    const data = (await response.json()) as {
      data: {
        id: string;
        login: string;
        display_name: string;
        profile_image_url: string;
      }[];
    };
    if (!data.data[0]) throw new TwitchApiError(404, "Canal no encontrado.");
    const user = data.data[0];
    return {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      avatar: user.profile_image_url,
    };
  }
  async checkLive(login: string): Promise<LiveResult> {
    const clientId = this.clientId()?.trim();
    if (!clientId) throw new TwitchApiError(401, "Falta Client ID.");
    const response = await this.authenticatedFetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`,
    );
    if (!response.ok)
      throw await this.responseError(
        response,
        "No se pudo comprobar el directo en Twitch.",
      );
    const json = (await response.json()) as {
      data?: { id: string; title?: string; game_name?: string }[];
    };
    const stream = json.data?.[0];
    return stream
      ? {
          live: true,
          sessionId: String(stream.id),
          title: stream.title,
          category: stream.game_name,
        }
      : { live: false };
  }
  async send(broadcasterId: string, message: string) {
    const connection = await this.validate();
    const senderId = connection.userId ?? "";
    assertAuthenticatedSender(connection.userId ?? "", senderId);
    const response = await this.authenticatedFetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
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
      /* sin JSON */
    }
    const normalized = message.toLowerCase();
    const invalidRefresh = response.status === 400 && /refresh|invalid|revok/.test(normalized);
    return new TwitchApiError(
      response.status,
      message,
      Number(response.headers.get("retry-after") ?? 0),
      invalidRefresh || response.status === 401 ? "reconnect-required" : response.status === 403 ? "permissions" : "temporary",
    );
  }
  diagnostics() {
    let tokens: ReturnType<TwitchAuth["read"]>;
    try { tokens = this.read(); } catch { tokens = undefined; }
    return { accountType: tokens?.accountType, expiresAt: tokens?.expiresAt, refreshInProgress: Boolean(this.refreshPromise), lastValidation: this.lastValidation, lastRefreshResult: this.lastRefreshResult, lastRefreshAt: this.lastRefreshAt, lastErrorStatus: this.lastErrorStatus, lastErrorCategory: this.lastErrorCategory, clientIdMatches: Boolean(tokens && (!tokens.clientId || tokens.clientId === this.clientId()?.trim())), safeStorageAvailable: safeStorage.isEncryptionAvailable() };
  }
}
