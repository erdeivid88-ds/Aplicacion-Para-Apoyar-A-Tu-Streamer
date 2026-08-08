import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("bundle runtime de Electron main", () => {
  it("externaliza paquetes CommonJS usados en runtime", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["build:electron"]).toContain("--packages=external");
    expect(pkg.dependencies).toHaveProperty("electron-updater");
    expect(pkg.dependencies).toHaveProperty("electron-store");
  });

  it("no vuelve a incluir fs-extra o graceful-fs en el bundle ESM", () => {
    const bundle = readFileSync(join(process.cwd(), "dist-electron/main/index.js"), "utf8");
    expect(bundle).toContain('from "electron-updater"');
    expect(bundle).not.toContain("node_modules/fs-extra");
    expect(bundle).not.toContain("node_modules/graceful-fs");
    expect(bundle).not.toContain('Dynamic require of "fs" is not supported');
  });
});
