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

export type IconName =
  | "home"
  | "users"
  | "accounts"
  | "browser"
  | "activity"
  | "guide"
  | "settings"
  | "power"
  | "check"
  | "warning"
  | "plus"
  | "arrow";
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2.5 21c.7-4 2.8-6 6.5-6s5.8 2 6.5 6M16 4.5a4 4 0 0 1 0 7.5M17 15c2.5.4 4 2.4 4.5 5" />
      </>
    ),
    accounts: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <circle cx="9" cy="11" r="2" />
        <path d="M6 16c.6-1.6 1.6-2.4 3-2.4s2.4.8 3 2.4M15 10h3M15 14h3" />
      </>
    ),
    browser: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
      </>
    ),
    activity: <path d="M4 12h3l2-6 4 12 2-6h5" />,
    guide: (
      <>
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23Z" />
        <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23Z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 15a2 2 0 0 0 .4 2l-2.4 2.4a2 2 0 0 0-2-.4 2 2 0 0 0-1 1.8h-4A2 2 0 0 0 9 19a2 2 0 0 0-2 .4L4.6 17A2 2 0 0 0 5 15a2 2 0 0 0-1.8-1v-4A2 2 0 0 0 5 9a2 2 0 0 0-.4-2L7 4.6A2 2 0 0 0 9 5a2 2 0 0 0 1-1.8h4A2 2 0 0 0 15 5a2 2 0 0 0 2-.4L19.4 7A2 2 0 0 0 19 9a2 2 0 0 0 1.8 1v4A2 2 0 0 0 19 15Z" />
      </>
    ),
    power: (
      <>
        <path d="M12 2v10" />
        <path d="M6.4 5.6a8 8 0 1 0 11.2 0" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    warning: (
      <>
        <path d="M12 3 2 21h20Z" />
        <path d="M12 9v5M12 18h.01" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
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
