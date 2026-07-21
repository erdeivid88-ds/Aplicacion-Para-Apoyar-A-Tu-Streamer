import { describe, expect, it, vi } from "vitest";
import type { Streamer } from "../../src/domain/types";
import { TwitchProvider } from "./providers";

describe("proveedor Twitch", () => {
  it("delega la consulta en la sesión cifrada, no en ajustes antiguos", async () => {
    const checkLive = vi.fn(async () => ({
      live: true,
      sessionId: "stream-1",
      title: "Directo",
    }));
    const result = await new TwitchProvider({ checkLive }).check({
      normalizedName: "canal_real",
    } as Streamer);
    expect(checkLive).toHaveBeenCalledWith("canal_real");
    expect(result).toMatchObject({ live: true, sessionId: "stream-1" });
  });
});
