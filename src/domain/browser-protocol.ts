import { validateStreamUrl } from "./stream-url";
import type { Platform } from "./types";

export const PROTOCOL_VERSION = 1;
export const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024;
export type BrowserAction =
  | "ping" | "handshake" | "heartbeat" | "open_stream" | "mute_stream"
  | "unmute_stream" | "close_stream" | "get_stream_tabs" | "focus_stream"
  | "close_all_managed_streams" | "release_stream";
export interface BrowserMessage {
  protocolVersion: 1;
  requestId: string;
  appSessionId: string;
  action: BrowserAction;
  payload: Record<string, unknown>;
}
export function validateBrowserMessage(value: unknown): BrowserMessage {
  if (!value || typeof value !== "object") throw new Error("Mensaje no válido.");
  const m = value as Record<string, unknown>;
  if (m.protocolVersion !== PROTOCOL_VERSION) throw new Error("Protocolo incompatible.");
  if (typeof m.requestId !== "string" || !m.requestId || m.requestId.length > 128) throw new Error("requestId no válido.");
  if (typeof m.appSessionId !== "string" || !m.appSessionId || m.appSessionId.length > 128) throw new Error("appSessionId no válido.");
  const actions: BrowserAction[] = ["ping", "handshake", "heartbeat", "open_stream", "mute_stream", "unmute_stream", "close_stream", "get_stream_tabs", "focus_stream", "close_all_managed_streams", "release_stream"];
  if (!actions.includes(m.action as BrowserAction)) throw new Error("Acción desconocida.");
  if (!m.payload || typeof m.payload !== "object" || Array.isArray(m.payload)) throw new Error("Payload no válido.");
  return m as unknown as BrowserMessage;
}
export function validateOpenPayload(payload: Record<string, unknown>) {
  const platform = payload.platform as Platform;
  for (const key of ["streamerId", "streamSessionId", "monitorSessionId"])
    if (typeof payload[key] !== "string" || !(payload[key] as string).trim()) throw new Error(`${key} no válido.`);
  const url = validateStreamUrl(platform, payload.url);
  if (!url.valid) throw new Error(url.reason);
  return { ...payload, platform, url: url.url, active: payload.active === true, muted: payload.muted !== false };
}
