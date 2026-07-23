import net from "node:net";
import { NativeMessageDecoder, encodeNativeMessage } from "./framing";
const PIPE = "\\\\.\\pipe\\apoya-a-tu-streamer-native-v1";
const input = new NativeMessageDecoder();
let socket: net.Socket | undefined;
let reconnect: NodeJS.Timeout | undefined;
let ending = false;
function connectApplication() {
  if (ending) return;
  const next = net.createConnection(PIPE);
  socket = next;
  const relay = new NativeMessageDecoder();
  next.on("data", (chunk) => {
    try {
      for (const message of relay.push(Buffer.from(chunk)))
        process.stdout.write(encodeNativeMessage(message));
    } catch (error) {
      console.error(
        "[native-host] rejected relay",
        error instanceof Error ? error.message : "error",
      );
      next.destroy();
    }
  });
  next.on("error", () => undefined);
  next.on("close", () => {
    if (socket === next) socket = undefined;
    if (!ending) reconnect = setTimeout(connectApplication, 1000);
  });
}
connectApplication();
process.stdin.resume();
process.stdin.on("data", (chunk: Buffer) => {
  try {
    for (const value of input.push(chunk)) {
      const message = value as {
        protocolVersion?: number;
        requestId?: string;
        action?: string;
      };
      if (message.action === "native_host_ping")
        process.stdout.write(
          encodeNativeMessage({
            protocolVersion: 1,
            requestId: message.requestId,
            success: true,
            payload: { host: true },
          }),
        );
      else if (socket?.readyState === "open")
        socket.write(encodeNativeMessage(message));
      else
        process.stdout.write(
          encodeNativeMessage({
            protocolVersion: 1,
            requestId: message.requestId,
            success: false,
            error: "application_disconnected",
          }),
        );
    }
  } catch (error) {
    console.error(
      "[native-host] rejected input",
      error instanceof Error ? error.message : "error",
    );
    process.exitCode = 1;
  }
});
process.stdin.on("end", () => {
  ending = true;
  clearTimeout(reconnect);
  socket?.end();
});
