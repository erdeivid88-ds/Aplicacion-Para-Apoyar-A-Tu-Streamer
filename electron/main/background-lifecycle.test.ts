import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("ciclo de vida en segundo plano",()=>{
  it("los timers y heartbeat viven en main y minimizar no detiene",async()=>{const source=await readFile("electron/main/index.ts","utf8");expect(source).toContain("setInterval(");expect(source).toContain("backgroundThrottling: false");expect(source).not.toMatch(/on\(["']minimize["'][\s\S]{0,120}stop\(/);expect(source).not.toMatch(/on\(["']hide["'][\s\S]{0,120}stop\(/);});
  it("reanudar invalida y escanea",async()=>{const source=await readFile("electron/main/index.ts","utf8");expect(source).toContain('powerMonitor.on("resume"');expect(source).toContain("monitorGeneration++");expect(source).toContain("void scan(monitorGeneration)");});
});
