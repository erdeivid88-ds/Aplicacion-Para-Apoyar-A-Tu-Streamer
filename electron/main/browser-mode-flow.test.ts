import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const mainSource = () =>
  readFile(new URL("./index.ts", import.meta.url), "utf8");
const uiSource = () =>
  readFile(new URL("../../src/ui/App.tsx", import.meta.url), "utf8");

describe("selección del modo de navegador", () => {
  it("envía extension exactamente desde la UI y registra su persistencia", async () => {
    const [main, ui] = await Promise.all([mainSource(), uiSource()]);
    expect(ui).toContain("saveSettings({ browserMode: mode.id })");
    expect(ui).toContain('stage: "UI_SELECTED_BROWSER_MODE"');
    expect(main).toContain('stage: "STORED_BROWSER_MODE"');
    expect(main).toContain('stage: "MAIN_BROWSER_MODE"');
  });

  it("abre extension mediante Native Messaging sin fallback a system", async () => {
    const source = await mainSource();
    const start = source.indexOf('browserMode === "extension"');
    const extensionBranch = source.slice(
      start,
      source.indexOf("await safeExternal(validation.url)", start),
    );
    expect(extensionBranch).toContain('request("open_stream"');
    expect(extensionBranch).toContain('mode: "extension"');
    expect(extensionBranch).toContain('stage: "OPENER_SELECTED"');
    expect(extensionBranch).toContain("La extensión no está conectada.");
    expect(extensionBranch).not.toContain("safeExternal");
    expect(extensionBranch).not.toContain("extension_fallback");
    expect(extensionBranch).toContain("throw error");
  });

  it("mantiene estrategias independientes para internal y system", async () => {
    const source = await mainSource();
    const internalStart = source.indexOf('browserMode === "internal"');
    const internalBranch = source.slice(
      internalStart,
      source.indexOf('browserMode === "extension"', internalStart),
    );
    const systemStart = source.indexOf(
      "await safeExternal(validation.url)",
      source.indexOf('browserMode === "extension"'),
    );
    const systemBranch = source.slice(
      systemStart,
      source.indexOf("\n  }\n}", systemStart),
    );
    expect(internalBranch).toContain("internalBrowser.open");
    expect(internalBranch).not.toContain("safeExternal");
    expect(systemBranch).toContain('mode: "system"');
  });
});
