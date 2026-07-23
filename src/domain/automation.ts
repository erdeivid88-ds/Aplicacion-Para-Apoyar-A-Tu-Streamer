import { defaultRuntime, type AutomationRuntime, type Streamer } from "./types";

export const MIN_INTERVAL_MINUTES = 15;
export const MAX_MESSAGES_PER_STREAM = 5;
export const MAX_MESSAGE_LENGTH = 500;

export function sanitizeMessage(value: string) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}
export function normalizeAutomation(
  input: Partial<Streamer["automation"]>,
): Streamer["automation"] {
  return {
    enabled: input.enabled === true,
    authorized: input.authorized === true,
    authorizedAt: input.authorized ? input.authorizedAt : undefined,
    message: sanitizeMessage(input.message ?? ""),
    sendOnStart: input.sendOnStart !== false,
    repeat: input.repeat === true,
    intervalMinutes: Math.max(
      MIN_INTERVAL_MINUTES,
      Math.floor(input.intervalMinutes ?? MIN_INTERVAL_MINUTES),
    ),
    maxPerStream: Math.min(
      MAX_MESSAGES_PER_STREAM,
      Math.max(1, Math.floor(input.maxPerStream ?? MAX_MESSAGES_PER_STREAM)),
    ),
  };
}
export type AutomationDecision = {
  send: boolean;
  reason?: string;
  runtime: AutomationRuntime;
};
export function decideAutomation(
  streamer: Streamer,
  now: number,
): AutomationDecision {
  const config = normalizeAutomation(streamer.automation);
  let runtime = streamer.automationRuntime ?? defaultRuntime();
  if (!streamer.live || !streamer.sessionId)
    return { send: false, reason: "offline", runtime: defaultRuntime() };
  if (runtime.sessionId !== streamer.sessionId)
    runtime = { ...defaultRuntime(), sessionId: streamer.sessionId };
  if (!config.enabled) return { send: false, reason: "disabled", runtime };
  if (!config.authorized || !config.authorizedAt)
    return { send: false, reason: "unauthorized", runtime };
  if (!config.message) return { send: false, reason: "empty", runtime };
  if (runtime.paused || runtime.consecutiveErrors >= 3)
    return {
      send: false,
      reason: "paused",
      runtime: { ...runtime, paused: true },
    };
  if (runtime.sentCount >= config.maxPerStream)
    return { send: false, reason: "maximum", runtime };
  if (!runtime.initialSent)
    return {
      send: config.sendOnStart,
      reason: config.sendOnStart ? undefined : "initial-disabled",
      runtime,
    };
  if (!config.repeat)
    return { send: false, reason: "repeat-disabled", runtime };
  const due =
    !runtime.lastSentAt ||
    now - new Date(runtime.lastSentAt).getTime() >=
      config.intervalMinutes * 60000;
  return { send: due, reason: due ? undefined : "interval", runtime };
}
export function recordSuccess(
  runtime: AutomationRuntime,
  at: string,
): AutomationRuntime {
  return {
    ...runtime,
    initialSent: true,
    sentCount: runtime.sentCount + 1,
    lastSentAt: at,
    consecutiveErrors: 0,
  };
}
export function recordFailure(runtime: AutomationRuntime): AutomationRuntime {
  const errors = runtime.consecutiveErrors + 1;
  return { ...runtime, consecutiveErrors: errors, paused: errors >= 3 };
}
