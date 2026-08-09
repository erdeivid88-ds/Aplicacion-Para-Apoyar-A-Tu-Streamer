import {
  defaultRuntime,
  type AutomaticMessage,
  type AutomationRuntime,
  type Streamer,
} from "./types";

export const MIN_INTERVAL_MINUTES = 15;
export const MAX_MESSAGES_PER_STREAM = 9999;
export const DEFAULT_MAX_MESSAGES_PER_STREAM = 5;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_AUTOMATIC_MESSAGES = 200;

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
  const maxPerStream =
    input.maxPerStream === null
      ? null
      : normalizeMaxMessages(input.maxPerStream);
  const automaticMessages = normalizeMessages(
    input.automaticMessages,
    input.message,
  );
  return {
    enabled: input.enabled === true,
    authorized: input.authorized === true,
    authorizedAt: input.authorized ? input.authorizedAt : undefined,
    message: automaticMessages[0]?.text ?? "",
    automaticMessages,
    sendOnStart: input.sendOnStart !== false,
    repeat: input.repeat === true,
    intervalMinutes: Math.max(
      MIN_INTERVAL_MINUTES,
      Math.floor(input.intervalMinutes ?? MIN_INTERVAL_MINUTES),
    ),
    maxPerStream,
    lastLimitedMaxPerStream: normalizeMaxMessages(
      maxPerStream ?? input.lastLimitedMaxPerStream,
    ),
  };
}
function legacyMessageId(text: string) {
  let hash = 0;
  for (const character of text)
    hash = (Math.imul(hash, 31) + character.codePointAt(0)!) | 0;
  return `legacy-${Math.abs(hash).toString(36)}`;
}
export function normalizeMessages(
  messages: AutomaticMessage[] | undefined,
  legacyMessage = "",
) {
  const normalized = (messages ?? [])
    .slice(0, MAX_AUTOMATIC_MESSAGES)
    .map((item, index) => ({
      id:
        typeof item?.id === "string" && item.id.trim()
          ? item.id
          : `message-${index + 1}`,
      text: sanitizeMessage(item?.text ?? ""),
    }))
    .filter((item) => item.text.length > 0);
  if (normalized.length) return normalized;
  const text = sanitizeMessage(legacyMessage);
  return [
    {
      id: text ? legacyMessageId(text) : "empty-message",
      text,
    },
  ];
}
function normalizeMaxMessages(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value))
    return DEFAULT_MAX_MESSAGES_PER_STREAM;
  return Math.min(MAX_MESSAGES_PER_STREAM, Math.max(1, Math.floor(value)));
}
export type AutomationDecision = {
  send: boolean;
  reason?: string;
  runtime: AutomationRuntime;
  message?: AutomaticMessage;
  sequenceIndex?: number;
  sequenceLength?: number;
};
export function decideAutomation(
  streamer: Streamer,
  now: number,
  monitorSessionId?: string,
): AutomationDecision {
  const config = normalizeAutomation(streamer.automation);
  let runtime = streamer.automationRuntime ?? defaultRuntime();
  if (!streamer.live || !streamer.sessionId)
    return { send: false, reason: "offline", runtime: defaultRuntime() };
  if (
    runtime.sessionId !== streamer.sessionId ||
    runtime.monitorSessionId !== monitorSessionId
  )
    runtime = {
      ...defaultRuntime(),
      sessionId: streamer.sessionId,
      monitorSessionId,
      startedAt: new Date(now).toISOString(),
    };
  else if (!runtime.startedAt)
    runtime = { ...runtime, startedAt: new Date(now).toISOString() };
  if (!config.enabled) return { send: false, reason: "disabled", runtime };
  if (!config.authorized || !config.authorizedAt)
    return { send: false, reason: "unauthorized", runtime };
  if (!config.automaticMessages.length || !config.automaticMessages[0].text)
    return { send: false, reason: "empty", runtime };
  if (runtime.paused || runtime.consecutiveErrors >= 3)
    return {
      send: false,
      reason: "paused",
      runtime: { ...runtime, paused: true },
    };
  if (config.maxPerStream !== null && runtime.sentCount >= config.maxPerStream)
    return { send: false, reason: "maximum", runtime };
  const sequenceIndex = runtime.sentCount % config.automaticMessages.length;
  const sequence = {
    message: config.automaticMessages[sequenceIndex],
    sequenceIndex,
    sequenceLength: config.automaticMessages.length,
  };
  if (!runtime.initialSent) {
    const initialDue =
      config.sendOnStart ||
      now - new Date(runtime.startedAt!).getTime() >=
        config.intervalMinutes * 60000;
    return {
      send: initialDue,
      reason: initialDue ? undefined : "interval",
      runtime,
      ...sequence,
    };
  }
  if (!config.repeat)
    return { send: false, reason: "repeat-disabled", runtime };
  const due =
    !runtime.lastSentAt ||
    now - new Date(runtime.lastSentAt).getTime() >=
      config.intervalMinutes * 60000;
  return {
    send: due,
    reason: due ? undefined : "interval",
    runtime,
    ...sequence,
  };
}
export function formatAutomationSuccess(
  sentCount: number,
  maxPerStream: number | null,
  sequenceIndex: number,
  sequenceLength: number,
) {
  const sequence = `${sequenceIndex + 1}/${sequenceLength}`;
  return maxPerStream === null
    ? `Mensaje automático ${sequence} enviado · envío #${sentCount}.`
    : `Mensaje automático ${sequence} enviado (${sentCount}/${maxPerStream}).`;
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
