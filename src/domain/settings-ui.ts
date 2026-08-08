import type { MonitorStatus, Settings } from "./types";
export function mergeSettingsPatch(
  current: Settings,
  patch: Partial<Settings>,
): Settings {
  return {
    ...current,
    ...patch,
    platforms: patch.platforms
      ? {
          ...current.platforms,
          ...patch.platforms,
          twitch: { ...current.platforms.twitch, ...patch.platforms.twitch },
          kick: { ...current.platforms.kick, ...patch.platforms.kick },
        }
      : current.platforms,
  };
}
export const SETTINGS_CATEGORIES = [
  "General",
  "Monitor",
  "Navegador",
  "Extensión",
  "Twitch",
  "Mensajes",
  "Notificaciones",
  "Datos y privacidad",
  "Diagnóstico",
] as const;
export const MONITOR_LABELS: Record<MonitorStatus, string> = {
  off: "⏹ Monitor apagado",
  starting: "⏳ Iniciando monitor…",
  active: "✅ Monitor activo",
  checking: "🔄 Comprobando canales…",
  "partial-error": "⚠️ Activo con errores",
  stopping: "⏳ Deteniendo monitor…",
  error: "❌ Error del monitor",
  paused: "⏸ Monitor pausado",
};
export function validateSettings(settings: Settings) {
  const errors: string[] = [];
  if (settings.scanMinutes < 5)
    errors.push("El intervalo de barrido debe ser al menos 5 minutos.");
  if (settings.idleMinutes < 0)
    errors.push("Los minutos no pueden ser negativos.");
  if (
    settings.platforms.twitch.enabled &&
    !settings.platforms.twitch.clientId?.trim()
  )
    errors.push("Client ID vacío.");
  if (settings.reopenDelaySeconds < 3 || settings.reopenDelaySeconds > 60)
    errors.push("El tiempo de reapertura debe estar entre 3 y 60 segundos.");
  if (settings.maxReopensPerStream < 1 || settings.maxReopensPerStream > 10)
    errors.push("El máximo de reaperturas debe estar entre 1 y 10.");
  if (
    !Number.isFinite(settings.kickInitialVolume) ||
    settings.kickInitialVolume < 0 ||
    settings.kickInitialVolume > 1
  )
    errors.push("El volumen inicial de Kick debe estar entre 0 y 100 %.");
  return errors;
}
