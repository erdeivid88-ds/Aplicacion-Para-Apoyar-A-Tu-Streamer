import { useEffect, useRef, useState } from "react";
import {
  defaultAutomation,
  type AppState,
  type Platform,
  type Settings,
  type Streamer,
} from "../domain/types";
import { MONITOR_LABELS, validateSettings } from "../domain/settings-ui";
import {
  errorReportMailto,
  errorReportTemplate,
  IDS_URL,
  safeDiagnostic,
  SUPPORT_EMAIL,
} from "../domain/support";
import {
  Alert,
  Card,
  EmptyState,
  PageHeader,
  PlatformMark,
  SaveStatus,
  SettingRow,
  StatusBadge,
  Switch,
  Tooltip,
} from "./components";

const navigation = [
  ["Inicio", "⌂"],
  ["Streamers", "♡"],
  ["Plataformas", "◉"],
  ["Automatizaciones", "✦"],
  ["Navegador", "▣"],
  ["Actividad", "◷"],
  ["Ajustes", "⚙"],
  ["Ayuda", "?"],
] as const;
type Page = (typeof navigation)[number][0];

export default function App() {
  const [state, setState] = useState<AppState>();
  const [page, setPage] = useState<Page>("Inicio");
  useEffect(() => {
    void window.api.state().then(setState);
    return window.api.onState(setState);
  }, []);
  useEffect(() => {
    if (state) document.documentElement.dataset.theme = state.settings.theme;
  }, [state?.settings.theme]);
  if (!state)
    return (
      <div className="loading-shell" role="status">
        <span className="loader" />
        Preparando tu espacio…
      </div>
    );
  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} state={state} />
      <main id="main-content" tabIndex={-1}>
        <div className="topbar">
          <StatusBadge
            tone={
              state.monitor.status === "active"
                ? "success"
                : state.monitor.status === "partial-error"
                  ? "warning"
                  : "neutral"
            }
          >
            {MONITOR_LABELS[state.monitor.status].replace(/^[^\p{L}]+/u, "")}
          </StatusBadge>
          <span className="topbar-brand">
            Apoya a tu Streamer <small>1.1.0</small>
          </span>
        </div>
        {page === "Inicio" && <Home state={state} go={setPage} />}{" "}
        {page === "Streamers" && <Streamers state={state} />}{" "}
        {page === "Plataformas" && <Platforms state={state} />}{" "}
        {page === "Automatizaciones" && <Automations state={state} />}{" "}
        {page === "Navegador" && <Browser state={state} />}{" "}
        {page === "Actividad" && <Activity state={state} />}{" "}
        {page === "Ajustes" && <SettingsPage state={state} />}
        {page === "Ayuda" && <HelpSupport state={state} go={setPage} />}
        {state.monitor.toast && (
          <div className="toast" role="status">
            {state.monitor.toast}
          </div>
        )}
        {!state.settings.onboardingCompleted && (
          <Onboarding state={state} go={setPage} />
        )}
      </main>
    </div>
  );
}

function Sidebar({
  page,
  setPage,
  state,
}: {
  page: Page;
  setPage: (p: Page) => void;
  state: AppState;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>♡</span>
        <div>
          Apoya a tu
          <br />
          <b>Streamer</b>
        </div>
      </div>
      <nav aria-label="Navegación principal">
        {navigation.map(([name, icon]) => (
          <button
            key={name}
            className={page === name ? "active" : ""}
            aria-current={page === name ? "page" : undefined}
            title={name}
            onClick={() => setPage(name)}
          >
            <span aria-hidden="true">{icon}</span>
            <span>{name}</span>
            {name === "Plataformas" && state.bot.status === "connected" && (
              <i className="nav-dot success" />
            )}
            {name === "Navegador" && state.extension.connected && (
              <i className="nav-dot success" />
            )}
            {name === "Actividad" &&
              state.activity.some((x) => x.level === "error") && (
                <i className="nav-dot error" />
              )}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span
          className={`pulse ${state.monitor.status !== "off" ? "on" : ""}`}
        />
        {state.monitor.status === "off"
          ? "Monitor apagado"
          : "Monitor en marcha"}
      </div>
    </aside>
  );
}

function Home({ state, go }: { state: AppState; go: (p: Page) => void }) {
  const live = state.streamers.filter((x) => x.live);
  const enabled = Object.values(state.settings.platforms).filter(
    (x) => x.enabled,
  ).length;
  return (
    <section>
      <PageHeader
        title="Apoya a tus streamers"
        description="Nos encargamos de comprobar tus canales y abrir cada directo como tú prefieras."
        action={
          state.monitor.status === "off" ? (
            <button
              className="button primary large"
              onClick={() => void window.api.start()}
            >
              ▶ Encender monitor
            </button>
          ) : (
            <button
              className="button danger large"
              disabled={state.monitor.status === "stopping"}
              onClick={() => void window.api.stop()}
            >
              ■{" "}
              {state.monitor.status === "stopping"
                ? "Deteniendo…"
                : "Apagar monitor"}
            </button>
          )
        }
      />
      <div className="hero-card">
        <div>
          <StatusBadge
            tone={state.monitor.status === "active" ? "success" : "info"}
          >
            {MONITOR_LABELS[state.monitor.status].replace(/^[^\p{L}]+/u, "")}
          </StatusBadge>
          <h3>
            {live.length
              ? `${live.length} ${live.length === 1 ? "streamer está" : "streamers están"} en directo`
              : "Todo tranquilo por ahora"}
          </h3>
          <p>
            La próxima comprobación se hará{" "}
            {state.monitor.nextScan
              ? relativeTime(state.monitor.nextScan)
              : "cuando enciendas el monitor"}
            .
          </p>
        </div>
        <button
          className="button subtle"
          onClick={() => void window.api.scan()}
        >
          ↻ Comprobar ahora
        </button>
      </div>
      <div className="summary-grid">
        <Summary
          icon="♡"
          value={state.streamers.length}
          label="Streamers añadidos"
        />
        <Summary icon="●" value={live.length} label="En directo ahora" />
        <Summary icon="◉" value={enabled} label="Plataformas activas" />
        <Summary
          icon="◷"
          value={
            state.monitor.nextScan
              ? new Date(state.monitor.nextScan).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
          label="Próxima comprobación"
        />
      </div>
      <div className="section-heading">
        <div>
          <h3>En directo ahora</h3>
          <p>Accesos rápidos a los canales que están emitiendo.</p>
        </div>
      </div>
      {!live.length ? (
        <EmptyState
          icon="☕"
          title="Ninguno de tus streamers está en directo"
          description="Puedes comprobar de nuevo o relajarte: el monitor seguirá atento."
          action={
            <button className="button" onClick={() => void window.api.scan()}>
              Comprobar ahora
            </button>
          }
        />
      ) : (
        <div className="stream-grid">
          {live.map((s) => (
            <StreamerCard key={s.id} item={s} compact />
          ))}
        </div>
      )}
      <QuickAlerts state={state} go={go} />
    </section>
  );
}
function Summary({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string | number;
  label: string;
}) {
  return (
    <Card className="summary">
      <span aria-hidden="true">{icon}</span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
    </Card>
  );
}
function QuickAlerts({
  state,
  go,
}: {
  state: AppState;
  go: (p: Page) => void;
}) {
  return (
    <div className="alerts-stack">
      {state.bot.status !== "connected" && (
        <Alert
          tone="warning"
          title="Twitch no está conectado"
          action={
            <button onClick={() => go("Plataformas")}>Conectar Twitch</button>
          }
        >
          Conecta una cuenta para comprobar canales de Twitch.
        </Alert>
      )}
      {state.settings.browserMode === "extension" &&
        !state.extension.connected && (
          <Alert
            tone="warning"
            title="El conector del navegador no responde"
            action={
              <button onClick={() => go("Navegador")}>
                Configurar extensión
              </button>
            }
          >
            Comprueba la extensión y el conector de Chrome o Edge.
          </Alert>
        )}
      {state.monitor.errors[0] && (
        <Alert
          tone="error"
          title="Hay una incidencia reciente"
          action={
            <button onClick={() => go("Actividad")}>Revisar error</button>
          }
        >
          {state.monitor.errors[0]}
        </Alert>
      )}
    </div>
  );
}

function Streamers({ state }: { state: AppState }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [wizard, setWizard] = useState(false);
  const items = state.streamers.filter(
    (s) =>
      (!query ||
        `${s.displayName} ${s.normalizedName}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "Todos" ||
        (filter === "En directo" && s.live) ||
        (filter === "Desconectados" && !s.live) ||
        filter === s.platform[0].toUpperCase() + s.platform.slice(1) ||
        (filter === "Con errores" && s.lastError)),
  );
  return (
    <section>
      <PageHeader
        title="Tus streamers"
        description="Añade canales, consulta su estado y decide cuáles quieres acompañar."
        action={
          <button className="button primary" onClick={() => setWizard(true)}>
            ＋ Añadir streamer
          </button>
        }
      />
      <div className="toolbar">
        <label className="search">
          <span>⌕</span>
          <input
            aria-label="Buscar streamers"
            placeholder="Buscar por nombre o login"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="filter-pills" aria-label="Filtros">
          {[
            "Todos",
            "En directo",
            "Desconectados",
            "Twitch",
            "Kick",
            "Con errores",
          ].map((x) => (
            <button
              className={filter === x ? "active" : ""}
              onClick={() => setFilter(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
      {!state.streamers.length ? (
        <EmptyState
          icon="♡"
          title="Todavía no has añadido ningún streamer"
          description="Añade tu primer canal en unos pasos sencillos."
          action={
            <button className="button primary" onClick={() => setWizard(true)}>
              Añadir streamer
            </button>
          }
        />
      ) : !items.length ? (
        <EmptyState
          icon="⌕"
          title="No hay coincidencias"
          description="Prueba con otro nombre o filtro."
        />
      ) : (
        <div className="stream-grid">
          {items.map((item) => (
            <StreamerCard key={item.id} item={item} />
          ))}
        </div>
      )}
      {wizard && <StreamerWizard close={() => setWizard(false)} />}
    </section>
  );
}
function StreamerCard({
  item,
  compact = false,
}: {
  item: Streamer;
  compact?: boolean;
}) {
  return (
    <Card className="streamer-card">
      <div className="streamer-head">
        {item.avatar ? (
          <img src={item.avatar} alt="" />
        ) : (
          <div className="avatar-fallback">
            {item.displayName[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <div className="name-line">
            <h3>{item.displayName}</h3>
            <PlatformMark platform={item.platform} />
          </div>
          <p>@{item.normalizedName}</p>
        </div>
        <StatusBadge
          tone={item.lastError ? "error" : item.live ? "success" : "neutral"}
        >
          {item.lastError ? "Error" : item.live ? "En directo" : "Desconectado"}
        </StatusBadge>
      </div>
      {item.live && (
        <>
          <p className="stream-title">{item.title || "Directo en curso"}</p>
          <small>{item.category || "Sin categoría"}</small>
        </>
      )}
      <div className="meta">
        <span>Última comprobación</span>
        <b>
          {item.lastCheckedAt ? relativeTime(item.lastCheckedAt) : "Pendiente"}
        </b>
      </div>
      <div className="card-actions">
        <button onClick={() => void window.api.retryStream(item.id)}>
          Abrir
        </button>
        {item.live && (
          <button onClick={() => void window.api.muteExtensionTabs()}>
            Silenciar
          </button>
        )}
        <button onClick={() => void window.api.scan()}>Comprobar ahora</button>
        {!compact && (
          <>
            <button
              onClick={() =>
                void window.api.saveStreamer({
                  ...item,
                  enabled: !item.enabled,
                })
              }
            >
              {item.enabled ? "Pausar" : "Reanudar"}
            </button>
            <button
              className="icon-button danger-text"
              aria-label={`Eliminar ${item.displayName}`}
              onClick={() =>
                confirm(`¿Eliminar ${item.displayName}?`) &&
                void window.api.deleteStreamer(item.id)
              }
            >
              Eliminar
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

function StreamerWizard({ close }: { close: () => void }) {
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<Platform>("twitch");
  const [input, setInput] = useState("");
  const [manualId, setManualId] = useState("");
  const [preview, setPreview] = useState<{
    externalId: string;
    login: string;
    displayName: string;
    avatar?: string;
  }>();
  const [error, setError] = useState("");
  const verify = async () => {
    setError("");
    try {
      const found = await window.api.resolveStreamer(platform, input);
      setPreview({ ...found, externalId: found.externalId || manualId });
      setStep(3);
    } catch (e) {
      if (manualId.trim()) {
        const login =
          input
            .trim()
            .replace(/^@/, "")
            .split("/")
            .filter(Boolean)
            .at(-1)
            ?.toLowerCase() ?? "";
        setPreview({ externalId: manualId.trim(), login, displayName: login });
        setStep(3);
        return;
      }
      setError(
        e instanceof Error ? e.message : "No pudimos verificar el canal",
      );
    }
  };
  const finish = async () => {
    if (!preview) return;
    await window.api.saveStreamer({
      platform,
      displayName: preview.displayName,
      normalizedName: preview.login,
      externalId: preview.externalId,
      avatar: preview.avatar,
      enabled: true,
      live: false,
      automation: defaultAutomation(),
    });
    close();
  };
  return (
    <div className="backdrop" role="presentation">
      <div
        className="modal wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
      >
        <div className="modal-head">
          <div>
            <small>Paso {step} de 3</small>
            <h2 id="wizard-title">
              {step === 1
                ? "¿En qué plataforma está?"
                : step === 2
                  ? "Busca el canal"
                  : "Confirma el streamer"}
            </h2>
          </div>
          <button className="icon-button" aria-label="Cerrar" onClick={close}>
            ×
          </button>
        </div>
        <div className="progress">
          <i style={{ width: `${(step / 3) * 100}%` }} />
        </div>
        {step === 1 && (
          <div className="choice-grid">
            <button
              className={`choice ${platform === "twitch" ? "selected" : ""}`}
              onClick={() => setPlatform("twitch")}
            >
              <PlatformMark platform="twitch" />
              <b>Twitch</b>
              <span>Canales y mensajería autorizada</span>
            </button>
            <button
              className={`choice ${platform === "kick" ? "selected" : ""}`}
              onClick={() => setPlatform("kick")}
            >
              <PlatformMark platform="kick" />
              <b>Kick</b>
              <span>Seguimiento de directos</span>
            </button>
          </div>
        )}
        {step === 2 && (
          <>
            <label className="field">
              Nombre, URL o ID del canal
              <input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  platform === "twitch"
                    ? "por ejemplo: ibai"
                    : "por ejemplo: xqc"
                }
              />
              <small>
                Intentaremos encontrar el canal y completar sus datos.
              </small>
            </label>
            {(platform === "kick" || error) && (
              <><label className="field">
                ID del canal {platform === "twitch" ? "de Twitch" : "de Kick"}
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="ID numérica"
                />
                <small>
                  Kick necesita esta ID para consultar su API oficial.
                </small>
              </label><IdHelp /></>
            )}
            {error && (
              <Alert tone="error" title="No pudimos verificar el canal">
                {error}
              </Alert>
            )}
          </>
        )}
        {step === 3 && preview && (
          <Card className="preview">
            <div className="streamer-head">
              {preview.avatar ? (
                <img src={preview.avatar} alt="" />
              ) : (
                <div className="avatar-fallback">{preview.displayName[0]}</div>
              )}
              <div>
                <h3>{preview.displayName}</h3>
                <p>@{preview.login}</p>
                <small>
                  ID del canal:{" "}
                  {preview.externalId || "Añádela manualmente después"}
                </small>
              </div>
            </div>
          </Card>
        )}
        <div className="modal-actions">
          {step > 1 && <button onClick={() => setStep(step - 1)}>Atrás</button>}
          {step === 1 && (
            <button className="primary" onClick={() => setStep(2)}>
              Continuar
            </button>
          )}
          {step === 2 && (
            <button
              className="primary"
              disabled={
                !input.trim() || (platform === "kick" && !manualId.trim())
              }
              onClick={() => void verify()}
            >
              Verificar canal
            </button>
          )}
          {step === 3 && (
            <button className="primary" onClick={() => void finish()}>
              Añadir streamer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function IdHelp() {
  return (
    <div className="id-help">
      <Tooltip text="La ID es el identificador numérico único del canal." />
      <div>
        <b>¿No sabes cuál es la ID?</b>
        <p>Puedes obtenerla en Vortex IDs.</p>
      </div>
      <button onClick={() => void window.api.open(IDS_URL)}>
        Abrir Vortex IDs
      </button>
    </div>
  );
}

function Platforms({ state }: { state: AppState }) {
  const twitch = state.settings.platforms.twitch;
  const [clientId, setClientId] = useState(twitch.clientId ?? "");
  const [accountType, setAccountType] = useState<"personal" | "bot">(
    state.bot.accountType ?? "personal",
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      if (clientId !== (twitch.clientId ?? ""))
        void window.api.saveSettings({
          platforms: {
            ...state.settings.platforms,
            twitch: { ...twitch, clientId },
          },
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [clientId]);
  return (
    <section>
      <PageHeader
        title="Plataformas"
        description="Conecta tus cuentas y elige qué servicios quieres comprobar."
      />
      <div className="platform-grid">
        <Card className="platform-card twitch-card">
          <div className="platform-title">
            <PlatformMark platform="twitch" />
            <div>
              <h3>Twitch</h3>
              <p>Directos y mensajes autorizados</p>
            </div>
            <StatusBadge
              tone={
                state.bot.status === "connected"
                  ? "success"
                  : state.bot.status === "expired"
                    ? "warning"
                    : "neutral"
              }
            >
              {botLabel(state.bot.status)}
            </StatusBadge>
          </div>
          {state.bot.status === "connected" && (
            <div className="account">
              <img src={state.bot.avatarUrl} alt="" />
              <div>
                <b>{state.bot.displayName}</b>
                <span>
                  Cuenta {state.bot.accountType === "bot" ? "Bot" : "Personal"}
                </span>
              </div>
            </div>
          )}
          <SettingRow
            title="Habilitar Twitch"
            description="Incluye tus canales de Twitch en cada comprobación."
          >
            <Switch
              label="Habilitar Twitch"
              checked={twitch.enabled}
              onChange={(enabled) =>
                void window.api.saveSettings({
                  platforms: {
                    ...state.settings.platforms,
                    twitch: { ...twitch, enabled },
                  },
                })
              }
            />
          </SettingRow>
          <label className="field">
            Client ID público
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Pega aquí el Client ID"
            />
            <small>No necesitas un Client Secret.</small>
          </label>
          <label className="field">
            Cuenta que enviará mensajes
            <select
              value={accountType}
              disabled={state.bot.status === "connected"}
              onChange={(e) =>
                setAccountType(e.target.value as typeof accountType)
              }
            >
              <option value="personal">Mi cuenta personal</option>
              <option value="bot">Una cuenta bot</option>
            </select>
          </label>
          <div className="card-actions">
            <button
              className="primary"
              onClick={() => void window.api.connectTwitch(accountType)}
            >
              Conectar cuenta
            </button>
            <button onClick={() => void window.api.checkTwitchPermissions()}>
              Comprobar conexión
            </button>
            {state.bot.status === "connected" && (
              <button
                className="danger-text"
                onClick={() =>
                  confirm("¿Desconectar la cuenta de Twitch?") &&
                  void window.api.disconnectBot()
                }
              >
                Desconectar
              </button>
            )}
          </div>
          {state.bot.detail && (
            <Alert tone="error" title="Twitch necesita atención">
              {state.bot.detail}
            </Alert>
          )}
        </Card>
        <Card className="platform-card kick-card">
          <div className="platform-title">
            <PlatformMark platform="kick" />
            <div>
              <h3>Kick</h3>
              <p>Seguimiento de directos</p>
            </div>
            <StatusBadge
              tone={
                state.settings.platforms.kick.enabled ? "success" : "neutral"
              }
            >
              {state.settings.platforms.kick.enabled
                ? "Habilitado"
                : "Deshabilitado"}
            </StatusBadge>
          </div>
          <p className="feature-note">
            Puedes comprobar el estado de canales con la API oficial. La
            mensajería automática no está disponible actualmente.
          </p>
          <SettingRow
            title="Habilitar Kick"
            description="Incluye tus canales de Kick en cada comprobación."
          >
            <Switch
              label="Habilitar Kick"
              checked={state.settings.platforms.kick.enabled}
              onChange={(enabled) =>
                void window.api.saveSettings({
                  platforms: {
                    ...state.settings.platforms,
                    kick: { ...state.settings.platforms.kick, enabled },
                  },
                })
              }
            />
          </SettingRow>
        </Card>
      </div>
    </section>
  );
}

function Automations({ state }: { state: AppState }) {
  return (
    <section>
      <PageHeader
        title="Automatizaciones"
        description="Configura mensajes responsables y autorizados para cada canal."
      />
      {!state.streamers.length ? (
        <EmptyState
          icon="✦"
          title="Primero añade un streamer"
          description="Después podrás configurar aquí sus mensajes."
        />
      ) : (
        <div className="automation-list">
          {state.streamers.map((s) => (
            <Card key={s.id} className="automation-card">
              <div className="automation-title">
                <div>
                  <h3>{s.displayName}</h3>
                  <p>
                    {s.platform === "twitch"
                      ? `Enviará ${state.bot.displayName ?? "la cuenta conectada"}`
                      : "Mensajería no disponible en Kick"}
                  </p>
                </div>
                <Switch
                  label={`Automatización de ${s.displayName}`}
                  checked={s.automation.enabled}
                  onChange={(enabled) =>
                    void window.api.saveStreamer({
                      ...s,
                      automation: { ...s.automation, enabled },
                    })
                  }
                />
              </div>
              {s.platform === "twitch" && (
                <>
                  <SettingRow
                    title="Mensaje"
                    description="El texto que se enviará mientras el directo esté activo."
                  >
                    <input
                      maxLength={500}
                      defaultValue={s.automation.message}
                      onBlur={(e) =>
                        void window.api.saveStreamer({
                          ...s,
                          automation: {
                            ...s.automation,
                            message: e.target.value,
                          },
                        })
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    title="Repetir mensaje"
                    description="Vuelve a enviarlo mientras el directo continúe."
                  >
                    <Switch
                      label="Repetir mensaje"
                      checked={s.automation.repeat}
                      onChange={(repeat) =>
                        void window.api.saveStreamer({
                          ...s,
                          automation: { ...s.automation, repeat },
                        })
                      }
                    />
                  </SettingRow>
                  <div className="two-cols">
                    <SettingRow
                      title="Intervalo"
                      description="Espera mínima entre mensajes."
                    >
                      <select
                        value={s.automation.intervalMinutes}
                        onChange={(e) =>
                          void window.api.saveStreamer({
                            ...s,
                            automation: {
                              ...s.automation,
                              intervalMinutes: +e.target.value,
                            },
                          })
                        }
                      >
                        <option value="15">15 minutos</option>
                        <option value="30">30 minutos</option>
                        <option value="60">1 hora</option>
                      </select>
                    </SettingRow>
                    <SettingRow
                      title="Máximo por directo"
                      description="Evita enviar demasiados mensajes."
                    >
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={s.automation.maxPerStream}
                        onChange={(e) =>
                          void window.api.saveStreamer({
                            ...s,
                            automation: {
                              ...s.automation,
                              maxPerStream: +e.target.value,
                            },
                          })
                        }
                      />
                    </SettingRow>
                  </div>
                  <small className="muted">
                    Enviados en este directo: {s.automationRuntime.sentCount} ·{" "}
                    {s.automationRuntime.paused ? "En pausa" : "Preparado"}
                  </small>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Browser({ state }: { state: AppState }) {
  const [result, setResult] = useState("");
  const [installer, setInstaller] = useState(false);
  const modes = [
    {
      id: "default" as const,
      icon: "↗",
      title: "Navegador predeterminado",
      description: "Abre el directo en el navegador habitual del sistema.",
      features: [
        "Fácil y sin instalación adicional",
        "No puede silenciar ni cerrar pestañas",
      ],
    },
    {
      id: "extension" as const,
      icon: "◫",
      title: "Navegador con extensión",
      description:
        "Abre una pestaña real en Chrome o Edge que la aplicación puede controlar.",
      features: [
        "Silenciado y cierre automático",
        "Detecta cierres y puede reabrir",
        "Requiere extensión y conector",
      ],
    },
    {
      id: "managed" as const,
      icon: "▣",
      title: "Navegador interno",
      description:
        "Abre todos los directos en una única ventana de la aplicación con pestañas.",
      features: [
        "Una sola ventana, varias pestañas",
        "Silenciado y cierre automático",
        "No requiere extensión",
      ],
    },
  ];
  return (
    <section>
      <PageHeader
        title="Cómo abrir los directos"
        description="Elige la experiencia que mejor encaja contigo."
      />
      <div className="browser-modes">
        {modes.map((mode) => (
          <button
            className={`mode-card ${state.settings.browserMode === mode.id ? "selected" : ""}`}
            key={mode.id}
            onClick={() =>
              void window.api.saveSettings({ browserMode: mode.id })
            }
          >
            <span className="mode-icon">{mode.icon}</span>
            <StatusBadge
              tone={
                state.settings.browserMode === mode.id ? "success" : "neutral"
              }
            >
              {state.settings.browserMode === mode.id
                ? "Seleccionado"
                : "Disponible"}
            </StatusBadge>
            <h3>{mode.title}</h3>
            <p>{mode.description}</p>
            <ul>
              {mode.features.map((x) => (
                <li key={x}>✓ {x}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {state.settings.browserMode === "extension" && (
        <Card className="connector-card">
          <div>
            <h3>Extensión y conector del navegador</h3>
            <p>
              {state.extension.connected
                ? "Todo está preparado para controlar pestañas."
                : "Comprueba que la extensión y el conector estén instalados."}
            </p>
          </div>
          <StatusBadge tone={state.extension.connected ? "success" : "warning"}>
            {state.extension.connected
              ? "Extensión conectada"
              : state.extension.nativeHostConnected
                ? "Aplicación desconectada"
                : "Conector no registrado"}
          </StatusBadge>
          <div className="card-actions">
            <button className="primary" onClick={() => setInstaller(true)}>
              Configurar extensión
            </button>
            <button
              onClick={async () => {
                setResult("Comprobando…");
                try {
                  await window.api.checkExtension();
                  setResult("Extensión conectada");
                } catch {
                  setResult(
                    "No se pudo conectar. Ejecuta el diagnóstico del conector.",
                  );
                }
              }}
            >
              Comprobar conexión
            </button>
            <button
              onClick={() =>
                void window.api.open(
                  "https://github.com/erdeivid88-ds/Aplicacion-Para-Apoyar-A-Tu-Streamer#instalar-la-extensión-y-native-messaging",
                )
              }
            >
              Ver instrucciones
            </button>
            <button
              onClick={() =>
                void window.api.copy(
                  JSON.stringify(
                    {
                      extension: state.extension.connected,
                      connector: state.extension.nativeHostConnected,
                      browser: state.extension.browser,
                      protocol: state.extension.protocolVersion,
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              Copiar diagnóstico
            </button>
          </div>
          {result && <p role="status">{result}</p>}
        </Card>
      )}
      {installer && (
        <ExtensionInstaller state={state} close={() => setInstaller(false)} />
      )}
    </section>
  );
}

type InstallerStage = "pending" | "installed" | "configuring" | "configured" | "checking" | "connected" | "error";
function ExtensionInstaller({ state, close }: { state: AppState; close: () => void }) {
  const [browser, setBrowser] = useState<"chrome" | "edge">(state.settings.extensionBrowser);
  const [detected, setDetected] = useState({ chrome: false, edge: false });
  const [stage, setStage] = useState<InstallerStage>(state.extension.connected ? "connected" : "pending");
  const [message, setMessage] = useState("");
  const [path, setPath] = useState("");
  const [extensionId, setExtensionId] = useState("");
  useEffect(() => {
    void window.api.detectBrowsers().then(setDetected);
    void window.api.extensionInfo().then((info) => {
      setPath(info.path);
      setExtensionId(info.extensionId);
    }).catch((error) => {
      setStage("error");
      setMessage(error instanceof Error ? error.message : "No se encontró la carpeta de la extensión. Vuelve a compilar o reinstala la aplicación.");
    });
  }, []);
  const choose = (value: "chrome" | "edge") => {
    setBrowser(value);
    void window.api.saveSettings({ extensionBrowser: value });
  };
  const configure = async () => {
    setStage("configuring"); setMessage("Configurando el conector…");
    try {
      if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("ID incorrecto. Debe tener 32 letras minúsculas entre a y p.");
      const value = await window.api.registerNativeHost(browser, extensionId);
      if (!value.registered) throw new Error("El conector del navegador no está registrado.");
      setStage("configured"); setMessage("Conector registrado correctamente.");
      return true;
    } catch (error) { setStage("error"); setMessage(error instanceof Error ? error.message : "No se pudo configurar el conector."); return false; }
  };
  const check = async () => {
    setStage("checking"); setMessage("Comprobando comunicación…");
    try {
      if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("ID incorrecto. Debe tener 32 letras minúsculas entre a y p.");
      const host = await window.api.diagnoseNativeHost(browser, extensionId);
      if (!host.registered) throw new Error("Host no registrado. Configura el conector para este navegador.");
      await window.api.checkExtension();
      setStage("connected"); setMessage("Extensión conectada y lista para usar.");
      await window.api.saveSettings({ extensionInstallCompleted: true });
    } catch (error) {
      setStage("error");
      const detail = error instanceof Error ? error.message : "";
      setMessage(/ID incorrecto|Host no registrado|Tiempo de espera/i.test(detail) ? detail : `No se recibió respuesta de ${browser === "edge" ? "Microsoft Edge" : "Google Chrome"}. Comprueba que la extensión esté instalada y abierta.`);
    }
  };
  const loaded = async () => {
    setStage("installed"); setMessage("Extensión cargada.");
    if (await configure()) await check();
  };
  return (
    <div className="backdrop">
      <div className="modal installer-modal" role="dialog" aria-modal="true" aria-labelledby="installer-title">
        <button className="skip" onClick={close}>Cerrar</button>
        <h2 id="installer-title">Configurar extensión</h2>
        <p>Selecciona el navegador donde quieres utilizar Apoya a tu Streamer.</p>
        <div className="browser-choice">
          {(["chrome", "edge"] as const).map((item) => <button key={item} className={browser === item ? "selected" : ""} onClick={() => choose(item)}><b>{item === "chrome" ? "◉ Google Chrome" : "e Microsoft Edge"}</b><span>{detected[item] ? "Navegador instalado" : "Navegador no detectado"}</span><small>{state.extension.browser === item && state.extension.connected ? "Extensión conectada" : "Extensión no comprobada"}</small></button>)}
        </div>
        <ol className="install-progress">
          <li className={detected[browser] ? "done" : ""}>{detected[browser] ? "Navegador detectado" : "Navegador no detectado"}</li><li className={path ? "done" : ""}>Extensión incluida</li><li className={["configured","checking","connected"].includes(stage) ? "done" : ""}>Conector registrado</li><li className={stage === "connected" ? "done" : ""}>{stage === "connected" ? "Extensión conectada" : stage === "checking" ? "Comprobando conexión" : "Extensión no cargada"}</li>
        </ol>
        <div className="install-instructions development-flow"><Alert tone="info" title="Extensión incluida">La extensión ya está incluida con Apoya a tu Streamer. Solo tienes que cargarla una vez en el navegador.</Alert><ol><li>Abre {browser === "edge" ? "Microsoft Edge" : "Google Chrome"}.</li><li>Copia la dirección <code>{browser}://extensions</code> y pégala en la barra de direcciones.</li><li>Activa “Modo de desarrollador”.</li><li>Pulsa “{browser === "edge" ? "Cargar desempaquetada" : "Cargar descomprimida"}”.</li><li>Selecciona la carpeta mostrada a continuación.</li></ol><div className="extension-path"><code>{path || "Comprobando carpeta…"}</code><button disabled={!path} onClick={() => void window.api.copy(path)}>Copiar ruta</button></div><label className="field">ID de extensión<input value={extensionId} onChange={(event) => setExtensionId(event.target.value.trim().toLowerCase())} maxLength={32} /><small>Copia el ID que aparece en la tarjeta de la extensión.</small></label><div className="card-actions"><button onClick={() => void window.api.copy(`${browser}://extensions`)}>Copiar dirección</button><button disabled={!path} onClick={() => void window.api.showExtensionFolder()}>Abrir carpeta de la extensión</button><button onClick={() => void configure()}>Registrar conector</button><button className="primary" disabled={!path} onClick={() => void loaded()}>Ya la he cargado</button><button onClick={() => void check()}>Comprobar conexión</button></div></div>
        {stage === "error" && <div className="card-actions"><button onClick={() => void loaded()}>Reintentar</button></div>}
        {message && <Alert tone={stage === "error" ? "error" : "info"} title={stage === "error" ? "No se pudo completar" : "Estado"}>{message}</Alert>}
        {stage === "error" && <SupportActions state={state} compact />}
        <details><summary>Ver detalles técnicos</summary><p>El conector se registra para tu usuario de Windows y autoriza únicamente el ID indicado.</p></details>
        {!detected[browser] && <details><summary>No aparece mi navegador</summary><p>Puedes continuar si está instalado en otra ruta. Abre manualmente la página de extensiones y sigue los mismos pasos.</p></details>}
      </div>
    </div>
  );
}

function Activity({ state }: { state: AppState }) {
  const [filter, setFilter] = useState("Todos");
  const items = state.activity.filter(
    (x) =>
      filter === "Todos" ||
      (filter === "Errores" && x.level === "error") ||
      (filter === "Twitch" && x.platform === "twitch") ||
      (filter === "Kick" && x.platform === "kick") ||
      (filter === "Monitor" && /monitor/i.test(x.description)) ||
      (filter === "Mensajes" && /mensaje/i.test(x.description)) ||
      (filter === "Navegador" &&
        /pestaña|ventana|directo abierto/i.test(x.description)),
  );
  return (
    <section>
      <PageHeader
        title="Actividad"
        description="Una cronología clara de lo que ha hecho la aplicación."
        action={
          <button
            className="button danger-text"
            onClick={() =>
              confirm("¿Borrar todo el historial?") &&
              void window.api.clearActivity()
            }
          >
            Borrar historial
          </button>
        }
      />
      <div className="filter-pills">
        {[
          "Todos",
          "Monitor",
          "Twitch",
          "Kick",
          "Navegador",
          "Mensajes",
          "Errores",
        ].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {!items.length ? (
        <EmptyState
          icon="◷"
          title="No hay actividad en este filtro"
          description="Los próximos eventos aparecerán aquí."
        />
      ) : (
        <div className="timeline">
          {items.map((item) => (
            <div className={`activity-item ${item.level}`} key={item.id}>
              <i />
              <div>
                <div>
                  <b>{friendlyActivity(item.description)}</b>
                  <time>{new Date(item.at).toLocaleString()}</time>
                </div>
                {item.channel && (
                  <p>
                    {item.channel} · {item.platform}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";
function SettingsPage({ state }: { state: AppState }) {
  const categories = [
    "Apariencia",
    "Inicio y bandeja",
    "Monitor",
    "Apertura de directos",
    "Pestañas y sonido",
    "Notificaciones",
    "Privacidad y datos",
    "Avanzado",
    "Diagnóstico",
    "Ayuda y soporte",
  ] as const;
  const [category, setCategory] =
    useState<(typeof categories)[number]>("Apariencia");
  const [draft, setDraft] = useState(state.settings);
  const [status, setStatus] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revision = useRef(0);
  const pending = useRef(false);
  const lastPatch = useRef<Partial<Settings>>({});
  useEffect(() => {
    if (!pending.current) setDraft(state.settings);
  }, [state.settings]);
  const persist = async (patch: Partial<Settings>, rev: number) => {
    setStatus("saving");
    lastPatch.current = patch;
    try {
      await window.api.saveSettings(patch);
      if (rev === revision.current) {
        pending.current = false;
        setStatus("saved");
      }
    } catch {
      if (rev === revision.current) setStatus("error");
    }
  };
  const update = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
    immediate = false,
  ) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (key === "theme") document.documentElement.dataset.theme = String(value);
    pending.current = true;
    revision.current++;
    const rev = revision.current;
    clearTimeout(timer.current);
    if (validateSettings(next).length) {
      setStatus("idle");
      return;
    }
    const patch = { [key]: value } as Partial<Settings>;
    if (immediate) void persist(patch, rev);
    else timer.current = setTimeout(() => void persist(patch, rev), 550);
  };
  const bool = (key: keyof Settings, title: string, description: string) => (
    <SettingRow title={title} description={description}>
      <Switch
        label={title}
        checked={Boolean(draft[key])}
        onChange={(v) => update(key, v as never, true)}
      />
    </SettingRow>
  );
  return (
    <section>
      <PageHeader
        title="Ajustes"
        description="Personaliza la aplicación. Los cambios se guardan solos."
        action={
          <SaveStatus
            status={status}
            retry={() => void persist(lastPatch.current, revision.current)}
          />
        }
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Categorías de ajustes">
          {categories.map((x) => (
            <button
              className={category === x ? "active" : ""}
              onClick={() => setCategory(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </nav>
        <Card className="settings-panel">
          <h3>{category}</h3>
          {category === "Apariencia" && (
            <>
              <SettingRow
                title="Tema"
                description="Elige un aspecto claro, oscuro o adaptado a Windows."
              >
                <select
                  value={draft.theme}
                  onChange={(e) =>
                    update("theme", e.target.value as Settings["theme"], true)
                  }
                >
                  <option value="system">Usar tema de Windows</option>
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro</option>
                </select>
              </SettingRow>
              <SettingRow
                title="Idioma"
                description="La interfaz está disponible en español."
              >
                <select disabled>
                  <option>Español</option>
                </select>
              </SettingRow>
            </>
          )}
          {category === "Inicio y bandeja" && (
            <>
              {bool(
                "startup",
                "Iniciar con Windows",
                "Abre la aplicación al iniciar tu sesión.",
              )}
              {bool(
                "startMinimized",
                "Iniciar minimizada",
                "Comienza discretamente en segundo plano.",
              )}
              {bool(
                "minimizeToTray",
                "Mantener en la bandeja al cerrar",
                "La X oculta la ventana sin apagar el monitor.",
              )}
            </>
          )}
          {category === "Monitor" && (
            <>
              <SettingRow
                title="Frecuencia de comprobación"
                description="Cada cuánto se consultan tus canales."
                error={
                  draft.scanMinutes < 5 ? "El mínimo es 5 minutos." : undefined
                }
              >
                <input
                  type="number"
                  min="5"
                  value={draft.scanMinutes}
                  onChange={(e) => update("scanMinutes", +e.target.value)}
                />
              </SettingRow>
              {bool(
                "autoStart",
                "Encendido automático",
                "Activa el monitor después de un periodo de inactividad.",
              )}
            </>
          )}
          {category === "Apertura de directos" && (
            <>
              <SettingRow
                title="Modo de apertura"
                description="Dónde se abrirán los directos nuevos."
              >
                <select
                  value={draft.browserMode}
                  onChange={(e) =>
                    update(
                      "browserMode",
                      e.target.value as Settings["browserMode"],
                      true,
                    )
                  }
                >
                  <option value="default">Navegador predeterminado</option>
                  <option value="extension">Navegador con extensión</option>
                  <option value="managed">
                    Navegador interno con pestañas
                  </option>
                </select>
              </SettingRow>
              {bool(
                "extensionFallback",
                "Usar el navegador normal si la extensión falla",
                "Evita perder un directo si Chrome o Edge no están disponibles.",
              )}
              {bool(
                "reopenClosedStreams",
                "Volver a abrir pestañas cerradas",
                "Comprueba que el directo continúa antes de abrirlo de nuevo.",
              )}
              <SettingRow
                title="Espera antes de reabrir"
                description="Entre 3 y 60 segundos."
              >
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={draft.reopenDelaySeconds}
                  onChange={(e) =>
                    update("reopenDelaySeconds", +e.target.value)
                  }
                />
              </SettingRow>
            </>
          )}
          {category === "Pestañas y sonido" && (
            <>
              {bool(
                "muteManagedStreams",
                "Silenciar pestañas nuevas",
                "Los directos se abren sin sonido.",
              )}
              {bool(
                "muteOtherInternalTabs",
                "Silenciar las demás al activar una",
                "Solo una pestaña interna reproduce sonido cada vez.",
              )}
              {bool(
                "closeExtensionTabsOnEnd",
                "Cerrar al terminar el directo",
                "Cierra únicamente la pestaña administrada correspondiente.",
              )}
              {bool(
                "closeInternalBrowserWhenEmpty",
                "Cerrar el navegador interno cuando quede vacío",
                "La ventana desaparece después del último directo.",
              )}
            </>
          )}
          {category === "Notificaciones" &&
            bool(
              "notifications",
              "Mostrar notificaciones",
              "Recibe avisos de directos, conexiones e incidencias.",
            )}
          {category === "Privacidad y datos" && (
            <>
              <Alert title="Tus credenciales están protegidas">
                Los tokens de Twitch se cifran mediante Windows y nunca se
                envían al renderer ni a la extensión.
              </Alert>
              <div className="card-actions">
                <button onClick={() => void window.api.exportData()}>
                  Exportar configuración
                </button>
                <button onClick={() => void window.api.importData()}>
                  Importar configuración
                </button>
                <button
                  className="danger-text"
                  onClick={() =>
                    confirm("¿Borrar el historial?") &&
                    void window.api.clearActivity()
                  }
                >
                  Borrar historial
                </button>
              </div>
            </>
          )}
          {category === "Avanzado" && (
            <>
              {bool(
                "closeExtensionTabsOnAppClose",
                "Cerrar pestañas al salir completamente",
                "No se aplica al minimizar en la bandeja.",
              )}
              {bool(
                "notifyExtensionErrors",
                "Avisar de errores de la extensión",
                "Muestra problemas de conexión que requieren tu atención.",
              )}
              <button
                onClick={() => update("onboardingCompleted", false, true)}
              >
                Volver a ver la guía inicial
              </button>
            </>
          )}
          {category === "Diagnóstico" && (
            <>
              <pre className="diagnostic">
                {JSON.stringify(
                  {
                    version: "1.1.0",
                    system: navigator.platform,
                    monitor: MONITOR_LABELS[state.monitor.status],
                    twitch: state.bot.status,
                    kick: state.settings.platforms.kick.enabled,
                    extension: state.extension.connected,
                    connector: state.extension.nativeHostConnected,
                    browser: state.settings.browserMode,
                    timers: state.runtime,
                    lastScan: state.monitor.lastScan,
                    nextScan: state.monitor.nextScan,
                    errors: state.monitor.errors.slice(0, 3),
                  },
                  null,
                  2,
                )}
              </pre>
              <button
                onClick={() =>
                  void window.api.copy(
                    JSON.stringify(
                      {
                        version: "1.1.0",
                        monitor: state.monitor.status,
                        twitch: state.bot.status,
                        kick: state.settings.platforms.kick.enabled,
                        extension: state.extension.connected,
                        connector: state.extension.nativeHostConnected,
                        browser: state.settings.browserMode,
                        lastScan: state.monitor.lastScan,
                        nextScan: state.monitor.nextScan,
                        errors: state.monitor.errors.slice(0, 3),
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Copiar diagnóstico
              </button>
              <SupportActions state={state} compact />
            </>
          )}
          {category === "Ayuda y soporte" && <HelpContent state={state} />}
        </Card>
      </div>
    </section>
  );
}

function SupportActions({ state, compact = false }: { state: AppState; compact?: boolean }) {
  const [fallback, setFallback] = useState(false);
  const report = async () => {
    try { await window.api.open(errorReportMailto(state, navigator.platform)); }
    catch { setFallback(true); }
  };
  return <div className={compact ? "support-actions compact" : "support-actions"}>
    <button className="primary" onClick={() => void report()}>Informar sobre un error</button>
    <button onClick={() => void window.api.copy(JSON.stringify(safeDiagnostic(state, navigator.platform), null, 2))}>Copiar diagnóstico seguro</button>
    {fallback && <Alert tone="warning" title="No hay un cliente de correo configurado"><p>Copia el correo o la plantilla y pégalos en tu servicio de correo.</p><code>{SUPPORT_EMAIL}</code><div className="card-actions"><button onClick={() => void window.api.copy(SUPPORT_EMAIL)}>Copiar correo</button><button onClick={() => void window.api.copy(errorReportTemplate(state, navigator.platform))}>Copiar plantilla</button></div></Alert>}
  </div>;
}

function HelpContent({ state }: { state: AppState }) {
  return <div className="help-content">
    <div className="help-grid">
      <Card><h4>Configurar Twitch</h4><p>Añade tu Client ID público y conecta tu cuenta con el inicio seguro de Twitch.</p></Card>
      <Card><h4>Añadir streamers</h4><p>Introduce un login o URL. Twitch completa automáticamente ID, nombre y avatar.</p></Card>
      <Card><h4>Obtener IDs</h4><p>Si una ID no se puede resolver, usa Vortex IDs junto al campo de ID.</p><button onClick={() => void window.api.open(IDS_URL)}>Abrir Vortex IDs</button></Card>
      <Card><h4>Configurar extensión</h4><p>La extensión viene incluida. Usa “Configurar extensión” en Navegador y sigue el asistente para Chrome o Edge.</p></Card>
      <Card><h4>Solución de problemas</h4><p>Comprueba por separado la extensión, el conector y la comunicación.</p></Card>
    </div>
    <h3>Correo de soporte</h3><button className="email-link" onClick={() => void window.api.open(`mailto:${SUPPORT_EMAIL}`)}>{SUPPORT_EMAIL}</button><button onClick={() => void window.api.copy(SUPPORT_EMAIL)}>Copiar correo</button>
    <SupportActions state={state} />
  </div>;
}

function HelpSupport({ state, go }: { state: AppState; go: (page: Page) => void }) {
  return <section><PageHeader title="Ayuda y soporte" description="Guías sencillas, solución de problemas y contacto con Vortex Studio." action={<button onClick={() => go("Navegador")}>Configurar extensión</button>} /><HelpContent state={state} /></section>;
}

function Onboarding({ state, go }: { state: AppState; go: (p: Page) => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "Bienvenido",
      text: "Vamos a preparar la aplicación para acompañar a tus streamers.",
      icon: "♡",
    },
    {
      title: "Elige tus plataformas",
      text: "Puedes usar Twitch, Kick o ambas.",
      icon: "◉",
    },
    {
      title: "Conecta Twitch",
      text: "La autorización se hace mediante el flujo seguro de dispositivo.",
      icon: "T",
    },
    {
      title: "Elige dónde abrir",
      text: "Navegador normal, extensión o una ventana interna con pestañas.",
      icon: "▣",
    },
    {
      title: "Añade tu primer streamer",
      text: "Solo necesitamos su nombre o URL; intentaremos completar el resto.",
      icon: "＋",
    },
    {
      title: "Todo preparado",
      text: "Enciende el monitor y nosotros nos ocupamos de comprobar los directos.",
      icon: "✓",
    },
  ];
  const finish = async () => {
    await window.api.saveSettings({ onboardingCompleted: true });
    go(state.streamers.length ? "Inicio" : "Streamers");
  };
  const current = steps[step];
  return (
    <div className="backdrop onboarding">
      <div
        className="modal onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <button className="skip" onClick={() => void finish()}>
          Omitir guía
        </button>
        <span className="onboarding-icon">{current.icon}</span>
        <small>
          Paso {step + 1} de {steps.length}
        </small>
        <h2 id="onboarding-title">{current.title}</h2>
        <p>{current.text}</p>
        {step === 1 && (
          <div className="choice-row">
            <PlatformMark platform="twitch" />
            <PlatformMark platform="kick" />
          </div>
        )}
        {step === 3 && (
          <div className="mini-modes">
            <span>↗ Normal</span>
            <span>◫ Extensión</span>
            <span>▣ Interno</span>
          </div>
        )}
        <div className="dots">
          {steps.map((_, i) => (
            <i className={i === step ? "active" : ""} key={i} />
          ))}
        </div>
        <div className="modal-actions">
          {step > 0 && <button onClick={() => setStep(step - 1)}>Atrás</button>}
          <button
            className="primary"
            onClick={() =>
              step === steps.length - 1 ? void finish() : setStep(step + 1)
            }
          >
            {step === steps.length - 1 ? "Empezar" : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function relativeTime(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1)
    return diff < 0 ? "hace un momento" : "en menos de un minuto";
  if (minutes < 60)
    return diff < 0 ? `hace ${minutes} min` : `en ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return diff < 0 ? `hace ${hours} h` : `en ${hours} h`;
}
function botLabel(status: AppState["bot"]["status"]) {
  return (
    {
      connected: "Conectado",
      disconnected: "Desconectado",
      expired: "Token caducado",
      "insufficient-permissions": "Faltan permisos",
      "unauthorized-channel": "Canal sin autorizar",
      "rate-limited": "Demasiadas solicitudes",
      paused: "En pausa",
    } as const
  )[status];
}
function friendlyActivity(text: string) {
  return text
    .replace(/scan/gi, "comprobación")
    .replace(/Native Messaging/gi, "conector del navegador")
    .replace(/managed/gi, "administrada");
}
