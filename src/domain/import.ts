import { z } from "zod";
const platform = z.enum(["twitch", "kick"]);
const automation = z.object({
  enabled: z.boolean(),
  authorized: z.boolean(),
  authorizedAt: z.string().datetime().optional(),
  message: z.string().max(500),
  automaticMessages: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        text: z.string().trim().min(1).max(500),
      }),
    )
    .min(1)
    .max(200)
    .optional(),
  sendOnStart: z.boolean(),
  repeat: z.boolean(),
  intervalMinutes: z.number().min(15),
  maxPerStream: z.number().int().min(1).max(9999).nullable(),
  lastLimitedMaxPerStream: z.number().int().min(1).max(9999).optional(),
});
const runtime = z.object({
  sessionId: z.string().optional(),
  sentCount: z.number().int().min(0),
  initialSent: z.boolean(),
  startedAt: z.string().datetime().optional(),
  lastSentAt: z.string().datetime().optional(),
  consecutiveErrors: z.number().min(0),
  paused: z.boolean(),
});
const streamer = z
  .object({
    id: z.string().uuid(),
    platform,
    displayName: z.string().min(1).max(60),
    normalizedName: z.string().regex(/^[a-z0-9_]{2,30}$/),
    externalId: z.string().max(64).optional(),
    url: z
      .string()
      .url()
      .refine((value) =>
        /^https:\/\/(www\.)?(twitch\.tv|kick\.com)\/[a-z0-9_]+$/i.test(value),
      ),
    avatar: z.string().url().optional(),
    enabled: z.boolean(),
    live: z.boolean(),
    title: z.string().max(300).optional(),
    category: z.string().max(100).optional(),
    automation,
    automationRuntime: runtime,
  })
  .strip();
export function parseImport(raw: string) {
  if (new TextEncoder().encode(raw).length > 1024 * 1024)
    throw new Error("El archivo supera 1 MB.");
  const parsed = JSON.parse(raw);
  return z
    .object({
      streamers: z.array(streamer).max(500),
      settings: z.record(z.unknown()).optional(),
    })
    .parse(parsed);
}
