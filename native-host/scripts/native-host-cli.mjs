import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const nativeRoot = join(root, "native-host");
const generated = join(nativeRoot, "generated");
const config = JSON.parse(
  readFileSync(join(nativeRoot, "host-config.json"), "utf8"),
);
const roots = {
  edge: "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
  chrome: "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
};
function args() {
  const result = {
    command: process.argv[2],
    browser: undefined,
    extensionId: config.extensionId,
    all: false,
  };
  for (const value of process.argv.slice(3)) {
    if (value === "--all") result.all = true;
    else if (value.startsWith("--browser=")) result.browser = value.slice(10);
    else if (value.startsWith("--extension-id="))
      result.extensionId = value.slice(15);
  }
  return result;
}
function browsers(options) {
  if (options.all) return ["edge", "chrome"];
  if (options.browser in roots) return [options.browser];
  throw new Error("Usa --browser=edge, --browser=chrome o --all.");
}
function nodePath() {
  try {
    return execFileSync("where.exe", ["node.exe"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find(Boolean);
  } catch {
    throw new Error(
      "No se encontró Node.js. Ejecuta npm ci y asegúrate de tener Node instalado.",
    );
  }
}
function registryKey(browser) {
  return `${roots[browser]}\\${config.hostName}`;
}
function query(browser) {
  try {
    const output = execFileSync(
      "reg.exe",
      ["query", registryKey(browser), "/ve"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.match(/REG_SZ\s+(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}
function register(options) {
  if (!/^[a-p]{32}$/.test(options.extensionId))
    throw new Error("ID de extensión no válido.");
  const node = nodePath();
  const host = join(nativeRoot, "dist", "native-host.cjs");
  if (!existsSync(host))
    throw new Error(
      "No existe native-host/dist/native-host.cjs. Ejecuta npm run build:native-host.",
    );
  mkdirSync(generated, { recursive: true });
  const launcher = join(generated, "native-host-launcher.cmd");
  writeFileSync(launcher, `@echo off\r\n"${node}" "${host}"\r\n`, "utf8");
  for (const browser of browsers(options)) {
    const manifestPath = join(generated, `${browser}-manifest.json`);
    const manifest = {
      name: config.hostName,
      description: config.description,
      path: launcher,
      type: "stdio",
      allowed_origins: [`chrome-extension://${options.extensionId}/`],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    execFileSync(
      "reg.exe",
      [
        "add",
        registryKey(browser),
        "/ve",
        "/t",
        "REG_SZ",
        "/d",
        manifestPath,
        "/f",
      ],
      { stdio: "ignore" },
    );
    console.log(
      `${browser === "edge" ? "Edge" : "Chrome"}: host registrado en HKCU`,
    );
  }
}
function unregister(options) {
  for (const browser of browsers(options)) {
    try {
      execFileSync("reg.exe", ["delete", registryKey(browser), "/f"], {
        stdio: "ignore",
      });
      console.log(`${browser}: host desregistrado`);
    } catch {
      console.log(`${browser}: host no registrado`);
    }
  }
}
function validate(browser) {
  const label = browser === "edge" ? "Edge" : "Chrome";
  const manifestPath = query(browser);
  if (!manifestPath) return { ok: false, text: `${label}: host no registrado` };
  if (!existsSync(manifestPath))
    return { ok: false, text: `${label}: manifiesto no encontrado` };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, text: `${label}: manifiesto JSON no válido` };
  }
  if (manifest.name !== config.hostName || manifest.type !== "stdio")
    return { ok: false, text: `${label}: manifiesto incorrecto` };
  if (
    !manifest.allowed_origins?.includes(
      `chrome-extension://${config.extensionId}/`,
    )
  )
    return { ok: false, text: `${label}: extension ID no autorizado` };
  if (!isAbsolute(manifest.path) || !existsSync(manifest.path))
    return { ok: false, text: `${label}: launcher no encontrado` };
  if (!existsSync(join(nativeRoot, "dist", "native-host.cjs")))
    return { ok: false, text: `${label}: native-host.cjs no encontrado` };
  return { ok: true, text: `Native Messaging listo para ${label}` };
}
async function ping() {
  const launcher = join(generated, "native-host-launcher.cmd");
  if (!existsSync(launcher)) return false;
  return await new Promise((resolvePing) => {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", launcher], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const body = Buffer.from(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "doctor-ping",
        action: "native_host_ping",
        payload: {},
      }),
    );
    const frame = Buffer.alloc(body.length + 4);
    frame.writeUInt32LE(body.length);
    body.copy(frame, 4);
    let output = Buffer.alloc(0);
    const timer = setTimeout(() => {
      child.kill();
      resolvePing(false);
    }, 3000);
    child.stdout.on("data", (chunk) => {
      output = Buffer.concat([output, chunk]);
      if (output.length >= 4 && output.length >= 4 + output.readUInt32LE(0)) {
        clearTimeout(timer);
        const value = JSON.parse(
          output.subarray(4, 4 + output.readUInt32LE(0)).toString("utf8"),
        );
        child.stdin.end();
        resolvePing(
          value.requestId === "doctor-ping" && value.success === true,
        );
      }
    });
    child.stdin.write(frame);
  });
}
async function doctor() {
  console.log(`Windows: ${process.platform === "win32" ? "sí" : "no"}`);
  console.log(`Host: ${config.hostName}`);
  console.log(`Extensión: ${config.extensionId}`);
  try {
    console.log(`node.exe: ${nodePath()}`);
  } catch (error) {
    console.log(error.message);
  }
  for (const browser of ["edge", "chrome"]) console.log(validate(browser).text);
  console.log(
    `Framing y ping del host: ${(await ping()) ? "correcto" : "fallido"}`,
  );
}
try {
  const options = args();
  if (process.platform !== "win32")
    throw new Error("Este comando requiere Windows.");
  if (options.command === "register") register(options);
  else if (options.command === "unregister") unregister(options);
  else if (options.command === "doctor") await doctor();
  else throw new Error("Comando desconocido.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
