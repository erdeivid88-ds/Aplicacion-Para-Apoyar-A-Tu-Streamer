import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("branding de la aplicación", () => {
  it("incluye el logo fuente, el asset de UI y los iconos generados", () => {
    for (const relative of [
      "logo-lurks.PNG",
      "build/logo-lurks.png",
      "build/icon.ico",
      "src/assets/logo-lurks.png",
      "browser-extension/icons/16.png",
      "browser-extension/icons/32.png",
      "browser-extension/icons/48.png",
      "browser-extension/icons/128.png",
      "browser-extension/icons/256.png",
    ]) {
      const path = join(root, relative);
      expect(existsSync(path), relative).toBe(true);
      expect(statSync(path).size, relative).toBeGreaterThan(0);
    }
  });

  it("genera un ICO multirresolución válido", () => {
    const ico = readFileSync(join(root, "build/icon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(7);
    const sizes = Array.from({ length: 7 }, (_, index) => ico[6 + index * 16] || 256);
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });

  it("configura Electron, NSIS, recursos y BrowserWindow sin rutas locales", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.build.win.icon).toBe("build/icon.ico");
    expect(pkg.build.nsis.installerIcon).toBe("build/icon.ico");
    expect(pkg.build.nsis.uninstallerIcon).toBe("build/icon.ico");
    expect(pkg.build.extraResources).toContainEqual({ from: "build/icon.ico", to: "icon.ico" });
    const main = readFileSync(join(root, "electron/main/index.ts"), "utf8");
    expect(main).toContain("icon: applicationIconPath()");
    expect(main).toContain('join(process.resourcesPath, "icon.ico")');
    expect(main).not.toMatch(/C:\\\\Users|\/mnt\/data/);
  });

  it("referencia los iconos nuevos desde Manifest V3", () => {
    const manifest = JSON.parse(readFileSync(join(root, "browser-extension/manifest.json"), "utf8"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.icons).toEqual({
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    });
    expect(manifest.action.default_icon).toEqual({
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
    });
  });
});
