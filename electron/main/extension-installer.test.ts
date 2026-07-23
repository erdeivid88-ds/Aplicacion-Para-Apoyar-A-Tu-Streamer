import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("instalador seguro de extensión", () => {
  it("expone operaciones cerradas y registro HKCU para ambos navegadores", async () => {
    const [main, preload, index, app] = await Promise.all([readFile("electron/main/extension-installer.ts", "utf8"), readFile("electron/preload/index.ts", "utf8"), readFile("electron/main/index.ts", "utf8"), readFile("src/ui/App.tsx", "utf8")]);
    expect(main).toContain("HKCU\\\\Software\\\\Microsoft\\\\Edge");
    expect(main).toContain("HKCU\\\\Software\\\\Google\\\\Chrome");
    expect(preload).toContain("extension:register-host");
    expect(preload).not.toContain("exec(");
    expect(main).not.toMatch(/ExtensionInstallForcelist|SendKeys|user data.default/i);
    expect(index).not.toMatch(/openExternal\([^)]*(?:edge|chrome):\/\/extensions/);
    expect(index).not.toContain("extension:open-settings");
    expect(preload).toContain("browser-extension:show-folder");
    expect(index).toContain("shell.showItemInFolder(manifestPath)");
    expect(main).toContain('["manifest.json", "service-worker.js", "popup.html"]');
    expect(app).toContain("Copiar dirección");
    expect(app).toContain("Ya la he cargado");
    expect(app).toContain("Navegador instalado");
    expect(app).toContain("Extensión no comprobada");
    expect(main).toContain("Google/Chrome/Application/chrome.exe");
    expect(main).toContain("Microsoft/Edge/Application/msedge.exe");
    expect(main).toContain("^[a-p]{32}$");
    expect(main).toContain("unregisterNativeHost");
    expect(app).toContain("Registrar conector");
    expect(app).not.toMatch(/Abrir tienda|Instalar desde la tienda|versión de prueba/i);
  });
});
