import {
  useEffect,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <article className={`card ${className}`}>{children}</article>;
}
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "warning" | "error" | "info" | "neutral";
  children: ReactNode;
}) {
  return <span className={`status status-${tone}`}>{children}</span>;
}
export function EmptyState({
  icon = "✨",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "error";
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`alert alert-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
export function SettingRow({
  title,
  description,
  children,
  error,
}: {
  title: string;
  description: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="setting-row">
      <div>
        <label>{title}</label>
        <p>{description}</p>
        {error && (
          <small className="field-error" role="alert">
            {error}
          </small>
        )}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Tooltip({ text }: { text: string }) {
  return (
    <span className="tooltip" tabIndex={0} aria-label={text} data-tip={text}>
      ?
    </span>
  );
}
export function SaveStatus({
  status,
  retry,
}: {
  status: "idle" | "saving" | "saved" | "error";
  retry: () => void;
}) {
  return (
    <div className={`save-status ${status}`} role="status">
      {status === "saving" ? (
        "Guardando…"
      ) : status === "saved" ? (
        "Guardado"
      ) : status === "error" ? (
        <>
          <span>No se pudo guardar</span>
          <button onClick={retry}>Reintentar</button>
        </>
      ) : (
        "Los cambios se guardan automáticamente"
      )}
    </div>
  );
}
export function PlatformMark({ platform }: { platform: "twitch" | "kick" }) {
  return (
    <span
      className={`platform-mark ${platform}`}
      aria-label={platform === "twitch" ? "Twitch" : "Kick"}
    >
      {platform === "twitch" ? "T" : "K"}
    </span>
  );
}

export function Modal({
  title,
  children,
  actions,
  close,
  className = "",
}: PropsWithChildren<{
  title: string;
  actions?: ReactNode;
  close?: () => void;
  className?: string;
}>) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node
      ?.querySelector<HTMLElement>("button, input, select, [tabindex]")
      ?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && close) close();
      if (event.key !== "Tab" || !node) return;
      const focusable = [
        ...node.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="backdrop" role="presentation">
      <div
        ref={panel}
        className={`modal accessible-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
      >
        <h2 id="app-modal-title">{title}</h2>
        <div className="modal-content">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
