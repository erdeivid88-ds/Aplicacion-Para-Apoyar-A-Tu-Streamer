import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("navegador interno con pestañas", () => {
  it("define una única ventana y WebContentsView", async () => {
    const source = await readFile("electron/main/internal-browser.ts", "utf8");
    expect(source).toContain("internalBrowserWindow");
    expect(source).toContain("new WebContentsView");
    expect(source.match(/new BrowserWindow/g)).toHaveLength(1);
    expect(source).not.toContain("BrowserView");
    expect(source).toMatch(/backgroundThrottling:\s*false/);
  });
});
