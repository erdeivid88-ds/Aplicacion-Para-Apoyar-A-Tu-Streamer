import type { Platform } from "./types";

const STREAM_LOGIN = /^[a-zA-Z0-9_]{2,30}$/;
const HOSTS: Record<Platform, ReadonlySet<string>> = {
  twitch: new Set(["twitch.tv", "www.twitch.tv"]),
  kick: new Set(["kick.com", "www.kick.com"]),
};

export type StreamUrlValidation =
  | { valid: true; url: string; login: string }
  | { valid: false; reason: string };

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
