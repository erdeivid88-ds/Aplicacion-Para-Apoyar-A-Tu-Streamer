import { app } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
export type SupportedBrowser = "chrome" | "edge";
const HOST_NAME = "es.vortexstudio.apoyaatustreamer";
const EXTENSION_ID = "jnpgebgidkgjmafnbpknialnjhkaigic";
const roots = {
  edge: "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
  chrome: "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
};

function resourcesRoot() {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "native-host");
}

export function browserInstallations() {
  const local = process.env.LOCALAPPDATA ?? "";
  const programFiles = process.env.PROGRAMFILES ?? "";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "";
  return {
    chrome: [join(programFiles, "Google/Chrome/Application/chrome.exe"), join(programFilesX86, "Google/Chrome/Application/chrome.exe"), join(local, "Google/Chrome/Application/chrome.exe")].some(existsSync),
    edge: [join(programFilesX86, "Microsoft/Edge/Application/msedge.exe"), join(programFiles, "Microsoft/Edge/Application/msedge.exe"), join(local, "Microsoft/Edge/Application/msedge.exe")].some(existsSync),
  };
}

function assertBrowser(value: unknown): asserts value is SupportedBrowser {
  if (value !== "chrome" && value !== "edge") throw new Error("Navegador no válido.");
}

export async function registerNativeHost(value: unknown) {
  assertBrowser(value);
  const nativeRoot = app.isPackaged ? join(resourcesRoot(), "native-host") : resourcesRoot();
  const executable = join(nativeRoot, "node.exe");
  const host = join(nativeRoot, "native-host.cjs");
  if (!existsSync(executable) || !existsSync(host)) throw new Error("No se encontraron los archivos del conector. Reinstala la aplicación.");
  const generated = join(app.getPath("userData"), "native-host");
  await mkdir(generated, { recursive: true });
  const launcher = join(generated, "native-host-launcher.cmd");
  await writeFile(launcher, `@echo off\r\n"${executable}" "${host}"\r\n`, "utf8");
  const manifestPath = join(generated, `${value}-manifest.json`);
  await writeFile(manifestPath, JSON.stringify({ name: HOST_NAME, description: "Conector de Apoya a tu Streamer", path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] }, null, 2), "utf8");
  await run("reg.exe", ["add", `${roots[value]}\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { windowsHide: true });
  return diagnoseNativeHost(value);
}

export async function unregisterNativeHost(value: unknown) {
  assertBrowser(value);
  await run("reg.exe", ["delete", `${roots[value]}\\${HOST_NAME}`, "/f"], { windowsHide: true }).catch(() => undefined);
}

export async function diagnoseNativeHost(value: unknown) {
  assertBrowser(value);
  try {
    const { stdout } = await run("reg.exe", ["query", `${roots[value]}\\${HOST_NAME}`, "/ve"], { windowsHide: true });
    const manifest = stdout.match(/REG_SZ\s+(.+)$/m)?.[1]?.trim();
    return { registered: Boolean(manifest && existsSync(manifest)), manifest, hostName: HOST_NAME, extensionId: EXTENSION_ID };
  } catch {
    return { registered: false, hostName: HOST_NAME, extensionId: EXTENSION_ID };
  }
}

export function developmentExtensionPath() {
  return app.isPackaged ? join(process.resourcesPath, "browser-extension") : join(app.getAppPath(), "browser-extension", "dist");
}
