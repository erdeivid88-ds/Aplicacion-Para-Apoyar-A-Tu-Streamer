import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("instalador seguro de extensión", () => {
  it("expone operaciones cerradas y registro HKCU para ambos navegadores", async () => {
    const [main, preload] = await Promise.all([readFile("electron/main/extension-installer.ts", "utf8"), readFile("electron/preload/index.ts", "utf8")]);
    expect(main).toContain("HKCU\\\\Software\\\\Microsoft\\\\Edge");
    expect(main).toContain("HKCU\\\\Software\\\\Google\\\\Chrome");
    expect(preload).toContain("extension:register-host");
    expect(preload).not.toContain("exec(");
    expect(main).not.toMatch(/ExtensionInstallForcelist|SendKeys|user data.default/i);
  });
});
