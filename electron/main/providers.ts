import type { LiveResult } from "../../src/domain/monitor";
import type { Streamer } from "../../src/domain/types";

export interface TwitchLiveSession {
  checkLive(login: string): Promise<LiveResult>;
}

export class TwitchProvider {
  readonly platform = "twitch" as const;
  constructor(private readonly session: TwitchLiveSession) {}
  check(channel: Streamer) {
    return this.session.checkLive(channel.normalizedName);
  }
}

export class KickProvider {
  readonly platform = "kick" as const;
  async check(channel: Streamer, accessToken?: string): Promise<LiveResult> {
    if (!accessToken)
      throw new Error("Kick necesita un token OAuth local.");
    const id = channel.externalId;
    if (!id)
      throw new Error(
        "Kick requiere la ID numérica del canal para usar su API oficial.",
      );
    const response = await fetch(
      `https://api.kick.com/public/v1/livestreams?broadcaster_user_id=${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok)
      throw new Error("No se pudo comprobar Kick. Se volverá a intentar.");
    const json = (await response.json()) as {
      data?: {
        id?: string;
        created_at?: string;
        stream_title?: string;
        category?: { name?: string };
      }[];
    };
    const stream = json.data?.[0];
    return stream
      ? {
          live: true,
          sessionId: String(stream.id ?? stream.created_at),
          title: stream.stream_title,
          category: stream.category?.name,
        }
      : { live: false };
  }
}
