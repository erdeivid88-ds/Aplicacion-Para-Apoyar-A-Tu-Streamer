import { app } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
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

function validateExtensionId(value: unknown) {
  if (typeof value !== "string" || !/^[a-p]{32}$/.test(value))
    throw new Error("ID incorrecto. Debe tener 32 letras minúsculas entre a y p.");
  return value;
}

export async function registerNativeHost(value: unknown, requestedExtensionId: unknown = EXTENSION_ID) {
  assertBrowser(value);
  const extensionId = validateExtensionId(requestedExtensionId);
  const nativeRoot = app.isPackaged ? join(resourcesRoot(), "native-host") : resourcesRoot();
  const executable = join(nativeRoot, "node.exe");
  const host = join(nativeRoot, "native-host.cjs");
  if (!existsSync(executable) || !existsSync(host)) throw new Error("No se encontraron los archivos del conector. Reinstala la aplicación.");
  const generated = join(app.getPath("userData"), "native-host");
  await mkdir(generated, { recursive: true });
  const launcher = join(generated, "native-host-launcher.cmd");
  await writeFile(launcher, `@echo off\r\n"${executable}" "${host}"\r\n`, "utf8");
  const manifestPath = join(generated, `${value}-manifest.json`);
  await writeFile(manifestPath, JSON.stringify({ name: HOST_NAME, description: "Conector de Apoya a tu Streamer", path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2), "utf8");
  await run("reg.exe", ["add", `${roots[value]}\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { windowsHide: true });
  return diagnoseNativeHost(value, extensionId);
}

export async function unregisterNativeHost(value: unknown) {
  assertBrowser(value);
  await run("reg.exe", ["delete", `${roots[value]}\\${HOST_NAME}`, "/f"], { windowsHide: true }).catch(() => undefined);
}

export async function diagnoseNativeHost(value: unknown, requestedExtensionId: unknown = EXTENSION_ID) {
  assertBrowser(value);
  const extensionId = validateExtensionId(requestedExtensionId);
  try {
    const { stdout } = await run("reg.exe", ["query", `${roots[value]}\\${HOST_NAME}`, "/ve"], { windowsHide: true });
    const manifest = stdout.match(/REG_SZ\s+(.+)$/m)?.[1]?.trim();
    if (!manifest || !existsSync(manifest)) return { registered: false, hostName: HOST_NAME, extensionId };
    const contents = JSON.parse(await readFile(manifest, "utf8")) as { allowed_origins?: string[]; path?: string };
    const authorized = contents.allowed_origins?.includes(`chrome-extension://${extensionId}/`) === true;
    return { registered: authorized && Boolean(contents.path && existsSync(contents.path)), authorized, manifest, hostName: HOST_NAME, extensionId };
  } catch {
    return { registered: false, hostName: HOST_NAME, extensionId };
  }
}

export async function validatedExtensionDirectory() {
  const base = resolve(app.isPackaged ? process.resourcesPath : app.getAppPath());
  const directory = resolve(base, app.isPackaged ? "browser-extension" : join("browser-extension", "dist"));
  const withinBase = relative(base, directory);
  if (withinBase.startsWith("..") || withinBase.includes(":")) throw new Error("La ruta de la extensión no es segura.");
  for (const file of ["manifest.json", "service-worker.js", "popup.html"]) {
    if (!existsSync(join(directory, file))) throw new Error("No se encontró la carpeta de la extensión. Vuelve a compilar o reinstala la aplicación.");
  }
  return { path: directory, manifestPath: join(directory, "manifest.json"), extensionId: EXTENSION_ID };
}
