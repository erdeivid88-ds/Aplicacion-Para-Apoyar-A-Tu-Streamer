import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("reapertura administrada", () => {
  it("se ejecuta en main con retraso, comprobación online y límite", async () => {
    const source = await readFile("electron/main/index.ts", "utf8");
    expect(source).toContain("function scheduleReopen");
    expect(source).toContain("reopenDelaySeconds");
    expect(source).toContain("maxReopensPerStream");
    expect(source).toMatch(/await new TwitchProvider\(auth\)\.check/);
    expect(source).toMatch(/if \(!fresh\.live/);
  });
  it("apagar cancela timers", async () =>
    expect(await readFile("electron/main/index.ts", "utf8")).toMatch(
      /async function stop[\s\S]*cancelReopens\(\)/,
    ));
});
