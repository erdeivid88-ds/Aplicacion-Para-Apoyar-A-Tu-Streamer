import type { Platform } from "./types";

const STREAM_LOGIN = /^[a-zA-Z0-9_]{2,30}$/;
const HOSTS: Record<Platform, ReadonlySet<string>> = {
  twitch: new Set(["twitch.tv", "www.twitch.tv"]),
  kick: new Set(["kick.com", "www.kick.com"]),
};

export type StreamUrlValidation =
  | { valid: true; url: string; login: string }
  | { valid: false; reason: string };

export function safeParseUrl(
  value: string | undefined | null,
  base?: string,
): URL | null {
  if (!value?.trim()) return null;
  try {
    return base ? new URL(value.trim(), base) : new URL(value.trim());
  } catch {
    return null;
  }
}

export function normalizeKickUrl(value: unknown): StreamUrlValidation {
  if (typeof value !== "string" || !value.trim())
    return { valid: false, reason: "URL_NOT_READY" };
  if (value.length > 2048) return { valid: false, reason: "KICK_URL_INVALID" };
  const raw = value.trim();
  const candidate = STREAM_LOGIN.test(raw)
    ? `https://kick.com/${raw}`
    : raw.startsWith("/")
      ? `https://kick.com${raw}`
      : /^(?:www\.)?kick\.com\//i.test(raw)
        ? `https://${raw}`
        : raw;
  const parsed = safeParseUrl(candidate);
  if (!parsed) return { valid: false, reason: "KICK_URL_INVALID" };
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (
    parsed.protocol !== "https:" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    !HOSTS.kick.has(parsed.hostname.toLowerCase()) ||
    parts.length !== 1 ||
    !STREAM_LOGIN.test(parts[0])
  )
    return { valid: false, reason: "KICK_URL_INVALID" };
  const login = parts[0].toLowerCase();
  return { valid: true, login, url: `https://kick.com/${login}` };
}

export type KickUrlDiagnostic = {
  success: boolean;
  canonicalUrl?: string;
  slug?: string;
  urlSource: "tab.url" | "webContents.getURL" | "canonicalUrl";
  urlReady: boolean;
  hostValid: boolean;
  slugResolved: boolean;
  errorCode?: "TAB_URL_NOT_READY" | "URL_NOT_READY" | "KICK_URL_INVALID";
};

export type ManagedStreamTarget = {
  platform: "kick";
  slug: string;
  canonicalUrl: string;
  tabId?: number;
  webContentsId?: number;
};

export function inspectKickUrl(
  value: unknown,
  urlSource: KickUrlDiagnostic["urlSource"],
): KickUrlDiagnostic {
  const urlReady = typeof value === "string" && Boolean(value.trim());
  if (!urlReady)
    return {
      success: false,
      urlSource,
      urlReady: false,
      hostValid: false,
      slugResolved: false,
      errorCode:
        urlSource === "tab.url" ? "TAB_URL_NOT_READY" : "URL_NOT_READY",
    };
  const normalized = normalizeKickUrl(value);
  if (!normalized.valid)
    return {
      success: false,
      urlSource,
      urlReady: true,
      hostValid: false,
      slugResolved: false,
      errorCode: "KICK_URL_INVALID",
    };
  return {
    success: true,
    canonicalUrl: normalized.url,
    slug: normalized.login,
    urlSource,
    urlReady: true,
    hostValid: true,
    slugResolved: true,
  };
}

export async function waitForKickUrl(
  read: () => Promise<unknown>,
  attempts = 3,
  delayMs = 150,
): Promise<KickUrlDiagnostic> {
  let diagnostic = inspectKickUrl(undefined, "tab.url");
  for (let attempt = 0; attempt < attempts; attempt++) {
    diagnostic = inspectKickUrl(await read(), "tab.url");
    if (diagnostic.success || diagnostic.errorCode !== "TAB_URL_NOT_READY")
      return diagnostic;
    if (attempt + 1 < attempts)
      await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return diagnostic;
}

/** The only URL gate used before persisting or opening a stream. */
export function validateStreamUrl(
  platform: unknown,
  value: unknown,
): StreamUrlValidation {
  if (platform !== "twitch" && platform !== "kick")
    return { valid: false, reason: "Plataforma no permitida." };
  if (typeof value !== "string" || !value.trim())
    return { valid: false, reason: "URL de canal vacía." };
  if (value.length > 2048)
    return { valid: false, reason: "URL de canal demasiado larga." };
  if (platform === "kick") return normalizeKickUrl(value);
  try {
    const parsed = new URL(value.trim());
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (
      parsed.protocol !== "https:" ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !HOSTS[platform].has(parsed.hostname.toLowerCase()) ||
      parts.length !== 1 ||
      !STREAM_LOGIN.test(parts[0])
    )
      return { valid: false, reason: "URL de canal no permitida." };
    const login = parts[0].toLowerCase();
    return {
      valid: true,
      login,
      url: `https://${platform === "twitch" ? "www.twitch.tv" : "kick.com"}/${login}`,
    };
  } catch {
    return { valid: false, reason: "URL de canal no válida." };
  }
}

export function streamUrl(platform: Platform, login: string) {
  const candidate = `https://${platform === "twitch" ? "www.twitch.tv" : "kick.com"}/${login}`;
  const result = validateStreamUrl(platform, candidate);
  if (!result.valid) throw new Error(result.reason);
  return result.url;
}
