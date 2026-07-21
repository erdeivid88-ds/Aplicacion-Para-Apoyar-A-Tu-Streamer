import type { BotConnection, TwitchAccountType } from "./types";

export const PERSONAL_TWITCH_SCOPES = ["user:write:chat"] as const;
export const BOT_TWITCH_SCOPES = ["user:write:chat", "user:bot"] as const;

export function scopesForAccount(type: TwitchAccountType): string[] {
  return [
    ...(type === "personal" ? PERSONAL_TWITCH_SCOPES : BOT_TWITCH_SCOPES),
  ];
}

export function migrateConnectionFrom102(
  connection: BotConnection | undefined,
): BotConnection {
  if (!connection) return { status: "disconnected" };
  return {
    ...connection,
    accountType: connection.accountType ?? "bot",
    scopes:
      connection.scopes ??
      (connection.userId ? [...BOT_TWITCH_SCOPES] : undefined),
  };
}

export function assertAuthenticatedSender(
  authenticatedUserId: string,
  senderId: string,
) {
  if (!authenticatedUserId || authenticatedUserId !== senderId)
    throw new Error("sender_id no coincide con la cuenta autenticada.");
}

export function connectedAccountLabel(connection: BotConnection): string {
  if (connection.status !== "connected") return "Cuenta de Twitch desconectada";
  return connection.accountType === "personal"
    ? "Cuenta personal conectada"
    : "Cuenta bot conectada";
}
