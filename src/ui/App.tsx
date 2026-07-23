import { useEffect, useState } from "react";
import {
  defaultAutomation,
  type AppState,
  type Platform,
  type Streamer,
} from "../domain/types";
import {
  MONITOR_LABELS,
  SETTINGS_CATEGORIES,
  validateSettings,
} from "../domain/settings-ui";
const pages = [
  "Inicio",
  "Plataformas",
  "Streamers",
  "Ajustes",
  "Actividad",
  "Contacto",
] as const;
type Page = (typeof pages)[number];
export default function App() {
  const [state, setState] = useState<AppState>();
  const [page, setPage] = useState<Page>("Inicio");
  useEffect(() => {
    void window.api.state().then(setState);
    return window.api.onState(setState);
  }, []);
  if (!state) return <main>Cargando…</main>;
  return (
    <div className="shell">
      <aside>
        <h1>Apoya a tu Streamer</h1>
        {pages.map((item) => (
          <button
            className={page === item ? "active" : ""}
            onClick={() => setPage(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </aside>
      <main>
        <header>
          <b>{MONITOR_LABELS[state.monitor.status]}</b>
        </header>
        {page === "Inicio" && <Home state={state} />}{" "}
        {page === "Plataformas" && <Platforms state={state} />}{" "}
        {page === "Streamers" && <Streamers state={state} />}{" "}
        {page === "Ajustes" && <Settings state={state} />}{" "}
        {page === "Actividad" && <Activity state={state} />}{" "}
        {page === "Contacto" && <Contact />}
        {state.monitor.toast && (
          <div className="toast" role="status">
            {state.monitor.toast}
          </div>
        )}
      </main>
    </div>
  );
}
function Home({ state }: { state: AppState }) {
  return (
    <section>
      <h2>Inicio</h2>
      <div className="hero">
        <p>Monitor legítimo con mensajería funcional autorizada.</p>
        {state.monitor.status === "off" ? (
          <button className="power" onClick={() => void window.api.start()}>
            Encender monitor
          </button>
        ) : (
          <button
            className="danger"
            disabled={state.monitor.status === "stopping"}
            onClick={() => void window.api.stop()}
          >
            {state.monitor.status === "stopping"
              ? "Deteniendo monitor…"
              : "Apagar monitor"}
          </button>
        )}
        <button onClick={() => void window.api.scan()}>Comprobar ahora</button>
      </div>
      <div className="grid">
        <Card value={state.streamers.length} label="Canales" />
        <Card
          value={state.streamers.filter((x) => x.live).length}
          label="En directo"
        />
        <Card
          value={state.streamers.filter((x) => x.automation.enabled).length}
          label="Automatizaciones"
        />
        <Card
          value={
            state.monitor.lastScan
              ? new Date(state.monitor.lastScan).toLocaleString()
              : "—"
          }
          label="Último barrido"
        />
      </div>
    </section>
  );
}
function Card({ value, label }: { value: string | number; label: string }) {
  return (
    <article>
      <b>{value}</b>
      <span>{label}</span>
    </article>
  );
}
function Platforms({
  state,
  onClientId,
}: {
  state: AppState;
  onClientId?: (value: string) => void;
}) {
  const twitch = state.settings.platforms.twitch;
  const [selectedType, setSelectedType] = useState<"personal" | "bot">(
    state.bot.accountType ?? "personal",
  );
  const connected = state.bot.status === "connected";
  return (
    <section>
      <h2>Plataformas</h2>
      <div className="grid">
        <article>
          <h3>Cuenta de Twitch conectada</h3>
          <p>
            Estado OAuth:{" "}
            <b>
              {connected
                ? state.bot.accountType === "personal"
                  ? "Cuenta personal conectada"
                  : "Cuenta bot conectada"
                : state.bot.status}
            </b>
            {state.bot.displayName && ` · ${state.bot.displayName}`}
          </p>
          <p>
            Tipo:{" "}
            <b>
              {state.bot.accountType === "bot"
                ? "Bot"
                : state.bot.accountType === "personal"
                  ? "Personal"
                  : "Sin seleccionar"}
            </b>
          </p>
          {state.bot.avatarUrl && (
            <img
              className="avatar"
              src={state.bot.avatarUrl}
              alt={`Avatar de ${state.bot.displayName ?? "Twitch"}`}
            />
          )}
          {state.bot.scopes && (
            <p>
              <small>Scopes concedidos: {state.bot.scopes.join(", ")}</small>
            </p>
          )}
          {state.bot.detail && (
            <small className="error">{state.bot.detail}</small>
          )}
          <label>
            Client ID público
            <input
              value={twitch.clientId ?? ""}
              maxLength={80}
              onChange={(event) =>
                onClientId
                  ? onClientId(event.target.value)
                  : void window.api.saveSettings({
                      platforms: {
                        ...state.settings.platforms,
                        twitch: { ...twitch, clientId: event.target.value },
                      },
                    })
              }
            />
          </label>
          <p>
            <strong>Cliente público</strong>
          </p>
          <small>
            Esta aplicación de escritorio utiliza un cliente público de Twitch.
            No necesita Client Secret.
          </small>
          <ol>
            <li>Abre Twitch Developer Console.</li>
            <li>Crea o administra una aplicación.</li>
            <li>Selecciona el tipo de cliente Público.</li>
            <li>Copia el Client ID.</li>
            <li>Pégalo aquí.</li>
            <li>Pulsa Conectar cuenta.</li>
          </ol>
          <p>
            <small>
              La cuenta personal enviará con su nombre real de Twitch. La cuenta
              bot enviará desde una cuenta separada. No se pueden conectar ambas
              simultáneamente en el mismo perfil local.
            </small>
          </p>
          <label>
            ¿Qué cuenta quieres conectar?
            <select
              value={selectedType}
              onChange={(event) =>
                setSelectedType(event.target.value as "personal" | "bot")
              }
              disabled={connected}
            >
              <option value="personal">Mi cuenta personal</option>
              <option value="bot">Una cuenta bot</option>
            </select>
          </label>
          <p>
            <small>
              {selectedType === "personal"
                ? "Scope solicitado: user:write:chat."
                : "Scopes solicitados: user:write:chat y user:bot."}
            </small>
          </p>
          <p>
            Cuenta que enviará el próximo mensaje:{" "}
            <b>{connected ? state.bot.displayName : "ninguna"}</b>
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => void window.api.connectTwitch(selectedType)}
            >
              Conectar cuenta
            </button>
            <button onClick={() => void window.api.disconnectBot()}>
              Desconectar
            </button>
            <button
              onClick={() => {
                const next = selectedType === "personal" ? "bot" : "personal";
                setSelectedType(next);
                void window.api.switchTwitchType(next);
              }}
            >
              Cambiar tipo de cuenta
            </button>
            <button onClick={() => void window.api.checkTwitchPermissions()}>
              Comprobar permisos
            </button>
            <button
              onClick={() =>
                void window.api.saveSettings({
                  platforms: {
                    ...state.settings.platforms,
                    twitch: { ...twitch, enabled: !twitch.enabled },
                  },
                })
              }
            >
              {twitch.enabled ? "Deshabilitar monitor" : "Habilitar monitor"}
            </button>
          </div>
          {state.deviceAuth.status !== "idle" &&
            state.deviceAuth.status !== "success" && (
              <div className="device-flow">
                <h4>Autorización del dispositivo</h4>
                <p>
                  Estado: <b>{state.deviceAuth.status}</b>
                </p>
                {state.deviceAuth.userCode && (
                  <>
                    <p>
                      Código: <code>{state.deviceAuth.userCode}</code>
                    </p>
                    <button
                      onClick={() =>
                        void window.api.copy(state.deviceAuth.userCode!)
                      }
                    >
                      Copiar código
                    </button>
                  </>
                )}
                {state.deviceAuth.verificationUri && (
                  <button onClick={() => void window.api.openTwitchDevice()}>
                    Abrir Twitch para autorizar
                  </button>
                )}{" "}
                {state.deviceAuth.expiresAt && (
                  <p>
                    Caduca:{" "}
                    {new Date(state.deviceAuth.expiresAt).toLocaleTimeString()}
                  </p>
                )}{" "}
                {state.deviceAuth.detail && (
                  <p className="error">{state.deviceAuth.detail}</p>
                )}
                <button
                  className="danger"
                  onClick={() => void window.api.cancelTwitchConnect()}
                >
                  Cancelar conexión
                </button>
              </div>
            )}
        </article>
        <article>
          <h3>Kick</h3>
          <p>
            Mensajería automática no disponible para Kick mediante la API
            oficial actual.
          </p>
          <small>
            No se usa DOM, Playwright, scraping, pulsaciones ni cookies.
          </small>
        </article>
      </div>
    </section>
  );
}
function Streamers({ state }: { state: AppState }) {
  const [form, setForm] = useState<Partial<Streamer>>({
    platform: "twitch",
    enabled: true,
    automation: defaultAutomation(),
  });
  const automation = form.automation ?? defaultAutomation();
  async function save() {
    await window.api.saveStreamer(form);
    setForm({
      platform: "twitch",
      enabled: true,
      automation: defaultAutomation(),
    });
  }
  return (
    <section>
      <h2>Streamers</h2>
      <article>
        <h3>{form.id ? "Editar" : "Añadir"} streamer</h3>
        <div className="form">
          <label>
            Plataforma
            <select
              value={form.platform}
              onChange={(event) =>
                setForm({ ...form, platform: event.target.value as Platform })
              }
            >
              <option value="twitch">Twitch</option>
              <option value="kick">Kick</option>
            </select>
          </label>
          <label>
            Nombre exacto
            <input
              maxLength={60}
              value={form.displayName ?? ""}
              onChange={(event) =>
                setForm({ ...form, displayName: event.target.value })
              }
            />
          </label>
          <label>
            ID del broadcaster
            <input
              maxLength={64}
              value={form.externalId ?? ""}
              onChange={(event) =>
                setForm({ ...form, externalId: event.target.value })
              }
            />
          </label>
        </div>
        <h4>Mensajería automática autorizada</h4>
        {form.platform === "kick" && (
          <p className="warning">
            Mensajería automática no disponible para Kick mediante la API
            oficial actual.
          </p>
        )}
        <div className="form">
          <Check
            label="Habilitada"
            checked={automation.enabled}
            set={(enabled) =>
              setForm({ ...form, automation: { ...automation, enabled } })
            }
          />
          <Check
            label="Autorización confirmada por el propietario"
            checked={automation.authorized}
            set={(authorized) =>
              setForm({ ...form, automation: { ...automation, authorized } })
            }
          />
          <Check
            label="Enviar al comenzar"
            checked={automation.sendOnStart}
            set={(sendOnStart) =>
              setForm({ ...form, automation: { ...automation, sendOnStart } })
            }
          />
          <Check
            label="Repetir"
            checked={automation.repeat}
            set={(repeat) =>
              setForm({ ...form, automation: { ...automation, repeat } })
            }
          />
          <label>
            Intervalo (mín. 15 min)
            <input
              type="number"
              min="15"
              value={automation.intervalMinutes}
              onChange={(event) =>
                setForm({
                  ...form,
                  automation: {
                    ...automation,
                    intervalMinutes: Math.max(15, +event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Máximo (1–5)
            <input
              type="number"
              min="1"
              max="5"
              value={automation.maxPerStream}
              onChange={(event) =>
                setForm({
                  ...form,
                  automation: {
                    ...automation,
                    maxPerStream: Math.min(5, Math.max(1, +event.target.value)),
                  },
                })
              }
            />
          </label>
          <label>
            Mensaje (máx. 500)
            <input
              maxLength={500}
              value={automation.message}
              onChange={(event) =>
                setForm({
                  ...form,
                  automation: { ...automation, message: event.target.value },
                })
              }
            />
          </label>
          <button className="primary" onClick={() => void save()}>
            Guardar
          </button>
        </div>
        {form.automation?.authorizedAt && (
          <small>
            Autorizado:{" "}
            {new Date(form.automation.authorizedAt).toLocaleString()}
          </small>
        )}
      </article>
      <div className="list">
        {state.streamers.map((item) => (
          <article key={item.id}>
            <div>
              <b>{item.displayName}</b>
              <span>
                {item.platform} · {item.live ? "En directo" : "Desconectado"} ·
                mensajería {item.automation.enabled ? "activa" : "inactiva"}
              </span>
              <small>
                Autorización:{" "}
                {item.automation.authorizedAt
                  ? new Date(item.automation.authorizedAt).toLocaleString()
                  : "no confirmada"}{" "}
                · enviados: {item.automationRuntime.sentCount}
              </small>
            </div>
            <div className="actions">
              <button onClick={() => void window.api.retryStream(item.id)}>
                Reintentar apertura
              </button>
              <button onClick={() => void window.api.cancelReopen(item.id)}>
                Cancelar reapertura
              </button>
              <button onClick={() => setForm(item)}>Editar</button>
              <button
                className="danger"
                onClick={() =>
                  confirm(`¿Eliminar ${item.displayName}?`) &&
                  void window.api.deleteStreamer(item.id)
                }
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function Check({
  label,
  checked,
  set,
}: {
  label: string;
  checked: boolean;
  set: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => set(event.target.checked)}
      />
      {label}
    </label>
  );
}
function Settings({ state }: { state: AppState }) {
  const categories = SETTINGS_CATEGORIES;
  const [category, setCategory] =
    useState<(typeof categories)[number]>("General");
  const [draft, setDraft] = useState(state.settings);
  const [saved, setSaved] = useState(state.settings);
  const [extensionCheck, setExtensionCheck] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const errors = validateSettings(draft);
  const update = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => setDraft({ ...draft, [key]: value });
  async function save() {
    if (errors.length) return;
    await window.api.saveSettings(draft);
    setSaved(draft);
  }
  function changeCategory(next: (typeof categories)[number]) {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Cambiar de sección?"))
      return;
    setCategory(next);
  }
  return (
    <section className="settings-page">
      <h2>Ajustes</h2>
      <nav className="settings-tabs" aria-label="Categorías de ajustes">
        {categories.map((item) => (
          <button
            key={item}
            className={category === item ? "active" : ""}
            onClick={() => changeCategory(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {dirty && <p className="warning">Cambios sin guardar</p>}
      {errors.map((error) => (
        <p className="error" key={error}>
          {error}
        </p>
      ))}
      <article className="settings-card">
        {category === "General" && (
          <div className="settings-grid">
            <label>
              Tema
              <select
                value={draft.theme}
                onChange={(e) =>
                  update("theme", e.target.value as typeof draft.theme)
                }
              >
                <option value="system">Sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </select>
            </label>
            <label>
              Idioma
              <select value={draft.language} disabled>
                <option value="es">Español</option>
              </select>
            </label>
            <Check
              label="Iniciar con Windows"
              checked={draft.startup}
              set={(v) => update("startup", v)}
            />
            <Check
              label="Iniciar minimizada"
              checked={draft.startMinimized}
              set={(v) => update("startMinimized", v)}
            />
            <Check
              label="Minimizar a la bandeja"
              checked={draft.minimizeToTray}
              set={(v) => update("minimizeToTray", v)}
            />
          </div>
        )}
        {category === "Monitor" && (
          <div className="settings-grid">
            <label>
              Intervalo de barrido
              <input
                type="number"
                min="5"
                value={draft.scanMinutes}
                onChange={(e) => update("scanMinutes", +e.target.value)}
              />
              <small>Mínimo 5 minutos.</small>
            </label>
            <label>
              Minutos de inactividad
              <input
                type="number"
                min="0"
                value={draft.idleMinutes}
                onChange={(e) => update("idleMinutes", +e.target.value)}
              />
            </label>
            <label>
              Cuenta atrás (segundos)
              <input
                type="number"
                min="5"
                value={draft.countdownSeconds}
                onChange={(e) => update("countdownSeconds", +e.target.value)}
              />
            </label>
            <Check
              label="Encendido automático por inactividad"
              checked={draft.autoStart}
              set={(v) => update("autoStart", v)}
            />
            <Check
              label="Permitir que el encendido automático reactive el monitor después de apagarlo manualmente"
              checked={draft.allowAutoReactivateAfterManualStop}
              set={(v) => update("allowAutoReactivateAfterManualStop", v)}
            />
            <p>
              Último barrido: {state.monitor.lastScan ?? "—"}
              <br />
              Próximo: {state.monitor.nextScan ?? "—"}
            </p>
            <div className="actions">
              <button onClick={() => void window.api.start()}>Encender</button>
              <button className="danger" onClick={() => void window.api.stop()}>
                Apagar
              </button>
              {state.monitor.status === "stopping" && (
                <button
                  className="danger"
                  onClick={() => void window.api.forceStop()}
                >
                  Forzar detención
                </button>
              )}
              <button onClick={() => void window.api.scan()}>
                Barrido ahora
              </button>
            </div>
          </div>
        )}
        {category === "Navegador" && (
          <div className="settings-grid">
            <label>
              Modo
              <select
                value={draft.browserMode}
                onChange={(e) =>
                  update(
                    "browserMode",
                    e.target.value as typeof draft.browserMode,
                  )
                }
              >
                <option value="default">Navegador predeterminado</option>
                <option value="extension">
                  Navegador predeterminado con extensión
                </option>
                <option value="managed">
                  Navegador interno de la aplicación
                </option>
              </select>
              <small>
                El navegador externo no puede silenciarse ni cerrarse desde la
                aplicación.
              </small>
            </label>
            <Check
              label="Cerrar ventanas internas al terminar"
              checked={draft.closeManagedTabs}
              set={(v) => update("closeManagedTabs", v)}
            />
            <Check
              label="Silenciar pestañas administradas"
              checked={draft.muteManagedStreams}
              set={(v) => update("muteManagedStreams", v)}
            />
            <Check
              label="Abrir en segundo plano"
              checked={draft.openStreamsInBackground}
              set={(v) => update("openStreamsInBackground", v)}
            />
            <Check
              label="Enfocar pestaña al abrir"
              checked={draft.focusStreamOnOpen}
              set={(v) => update("focusStreamOnOpen", v)}
            />
            <Check
              label="Cerrar pestaña al terminar"
              checked={draft.closeExtensionTabsOnEnd}
              set={(v) => update("closeExtensionTabsOnEnd", v)}
            />
            <Check
              label="Cerrar pestañas al apagar monitor"
              checked={draft.closeExtensionTabsOnMonitorStop}
              set={(v) => update("closeExtensionTabsOnMonitorStop", v)}
            />
            <Check
              label="Cerrar pestañas al cerrar aplicación"
              checked={draft.closeExtensionTabsOnAppClose}
              set={(v) => update("closeExtensionTabsOnAppClose", v)}
            />
            <Check
              label="Cerrar ventanas internas al apagar el monitor"
              checked={draft.closeInternalWindowsOnMonitorStop}
              set={(v) => update("closeInternalWindowsOnMonitorStop", v)}
            />
            <Check
              label="Usar navegador predeterminado si la extensión no está disponible"
              checked={draft.extensionFallback}
              set={(v) => update("extensionFallback", v)}
            />
            <Check
              label="Volver a abrir una pestaña si se cierra mientras el directo continúa"
              checked={draft.reopenClosedStreams}
              set={(v) => update("reopenClosedStreams", v)}
            />
            <label>
              Tiempo antes de reabrir (3–60 segundos)
              <input
                type="number"
                min="3"
                max="60"
                value={draft.reopenDelaySeconds}
                onChange={(e) =>
                  update(
                    "reopenDelaySeconds",
                    Math.min(60, Math.max(3, +e.target.value)),
                  )
                }
              />
            </label>
            <label>
              Máximo de reaperturas por directo (1–10)
              <input
                type="number"
                min="1"
                max="10"
                value={draft.maxReopensPerStream}
                onChange={(e) =>
                  update(
                    "maxReopensPerStream",
                    Math.min(10, Math.max(1, +e.target.value)),
                  )
                }
              />
            </label>
            <Check
              label="Preguntar antes de volver a abrir una pestaña cerrada"
              checked={draft.askBeforeReopen}
              set={(v) => update("askBeforeReopen", v)}
            />
            <Check
              label="Silenciar las demás pestañas al activar sonido en una"
              checked={draft.muteOtherInternalTabs}
              set={(v) => update("muteOtherInternalTabs", v)}
            />
            <Check
              label="Cerrar navegador interno cuando no queden directos"
              checked={draft.closeInternalBrowserWhenEmpty}
              set={(v) => update("closeInternalBrowserWhenEmpty", v)}
            />
            {draft.browserMode === "default" && (
              <p className="warning">
                No es posible detectar ni reabrir automáticamente una pestaña
                cerrada sin utilizar la extensión del navegador.
              </p>
            )}
            <p>
              Las ventanas gestionadas se silencian antes y después de navegar,
              se reutilizan y enfocan sin duplicados.
            </p>
          </div>
        )}
        {category === "Extensión" && (
          <div className="settings-grid">
            <h3>Extensión del navegador</h3>
            <p>
              Estado:{" "}
              <b>
                {state.extension.connected
                  ? "Aplicación conectada"
                  : "Aplicación desconectada"}
              </b>
            </p>
            <p>
              Native Messaging:{" "}
              {state.extension.nativeHostConnected
                ? "conectado"
                : "desconectado"}
              <br />
              Navegador: {state.extension.browser ?? "—"}
              <br />
              Versión: {state.extension.extensionVersion ?? "—"}
              <br />
              Protocolo: {state.extension.protocolVersion}
              <br />
              Sesión activa: {state.extension.sessionActive ? "sí" : "no"}
              <br />
              Último heartbeat: {state.extension.lastHeartbeat ?? "—"}
              <br />
              Pestañas administradas: {state.extension.managedTabs}
            </p>
            {state.extension.lastError && (
              <p className="error">{state.extension.lastError}</p>
            )}
            <p>
              La extensión controla únicamente las pestañas que abre para esta
              aplicación mientras la aplicación está conectada.
            </p>
            <button
              onClick={async () => {
                setExtensionCheck("Comprobando…");
                try {
                  await Promise.race([
                    window.api.checkExtension(),
                    new Promise((_, reject) =>
                      setTimeout(
                        () => reject(new Error("Tiempo de espera agotado")),
                        5000,
                      ),
                    ),
                  ]);
                  setExtensionCheck("Extensión conectada");
                } catch (error) {
                  const text =
                    error instanceof Error ? error.message : String(error);
                  setExtensionCheck(
                    /not found|no registrado|disponible/i.test(text)
                      ? "El Native Messaging Host no está registrado para Microsoft Edge."
                      : /unauthorized|autorizado/i.test(text)
                        ? "ID de extensión no autorizado"
                        : /timeout|espera/i.test(text)
                          ? "Tiempo de espera agotado"
                          : /executable|ejecutable/i.test(text)
                            ? "Host no ejecutable"
                            : "Extensión no instalada",
                  );
                }
              }}
            >
              Comprobar conexión
            </button>
            {extensionCheck && <p>{extensionCheck}</p>}
            <button onClick={() => void window.api.testExtension()}>
              Probar apertura
            </button>
            <button onClick={() => void window.api.muteExtensionTabs()}>
              Silenciar pestañas administradas
            </button>
            <button onClick={() => void window.api.closeExtensionTabs()}>
              Cerrar pestañas administradas
            </button>
            <button
              onClick={() => void window.api.open("https://www.twitch.tv/")}
            >
              Abrir instrucciones
            </button>
            <button
              onClick={() =>
                void window.api.copy(
                  JSON.stringify(
                    {
                      connected: state.extension.connected,
                      nativeHost: state.extension.nativeHostConnected,
                      browser: state.extension.browser,
                      version: state.extension.extensionVersion,
                      protocol: state.extension.protocolVersion,
                      managedTabs: state.extension.managedTabs,
                      lastError: state.extension.lastError,
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
        )}
        {category === "Twitch" && (
          <Platforms
            state={{ ...state, settings: draft }}
            onClientId={(value) =>
              setDraft({
                ...draft,
                platforms: {
                  ...draft.platforms,
                  twitch: { ...draft.platforms.twitch, clientId: value },
                },
              })
            }
          />
        )}
        {category === "Mensajes" && (
          <p>
            La mensajería se configura por canal en Streamers: desactivada por
            defecto, intervalo mínimo 15 minutos, máximo 5 por directo y pausa
            tras tres errores.
          </p>
        )}
        {category === "Notificaciones" && (
          <Check
            label="Activar notificaciones de directos, monitor, OAuth y mensajes"
            checked={draft.notifications}
            set={(v) => update("notifications", v)}
          />
        )}
        {category === "Datos y privacidad" && (
          <div>
            <p>Los tokens se cifran con safeStorage y nunca se exportan.</p>
            <div className="actions">
              <button onClick={() => void window.api.exportData()}>
                Exportar configuración
              </button>
              <button onClick={() => void window.api.importData()}>
                Importar configuración
              </button>
              <button onClick={() => void window.api.disconnectBot()}>
                Cerrar sesión de Twitch
              </button>
              <button
                className="danger"
                onClick={() =>
                  confirm("¿Limpiar historial?") &&
                  void window.api.clearActivity()
                }
              >
                Limpiar historial
              </button>
            </div>
          </div>
        )}
        {category === "Diagnóstico" && (
          <div>
            <pre>
              {JSON.stringify(
                {
                  version: "1.0.8",
                  platform: navigator.platform,
                  monitor: MONITOR_LABELS[state.monitor.status],
                  platforms: draft.platforms,
                  streamers: state.streamers.length,
                  oauth: state.bot.status,
                  scopes: state.bot.scopes ?? [],
                  browser: draft.browserMode,
                  timers: {
                    scan: Boolean(state.monitor.nextScan),
                    device: state.deviceAuth.status,
                  },
                  runtime: state.runtime,
                  internalBrowser: state.internalBrowser,
                  extensionHeartbeat: state.extension.lastHeartbeat,
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
                      version: "1.0.8",
                      monitor: state.monitor.status,
                      oauth: state.bot.status,
                      scopes: state.bot.scopes ?? [],
                      streamers: state.streamers.length,
                      browser: draft.browserMode,
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
        )}
      </article>
      <div className="settings-save">
        <button onClick={() => setDraft(saved)} disabled={!dirty}>
          Descartar cambios
        </button>
        <button
          className="primary"
          onClick={() => void save()}
          disabled={!dirty || errors.length > 0}
        >
          Guardar cambios
        </button>
      </div>
    </section>
  );
}
function Activity({ state }: { state: AppState }) {
  return (
    <section>
      <h2>Actividad</h2>
      <div className="actions">
        <button
          onClick={() =>
            void window.api.copy(
              state.activity
                .map((x) => `${x.at} ${x.level} ${x.description}`)
                .join("\n"),
            )
          }
        >
          Copiar registros
        </button>
        <button
          className="danger"
          onClick={() =>
            confirm("¿Limpiar el historial?") && void window.api.clearActivity()
          }
        >
          Limpiar
        </button>
      </div>
      <div className="list">
        {state.activity.map((item) => (
          <article key={item.id}>
            <time>{new Date(item.at).toLocaleString()}</time>
            <b>{item.level}</b>
            <span>
              {item.platform} {item.channel}
            </span>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
function Contact() {
  return (
    <section>
      <h2>Contacto</h2>
      <article>
        <a
          onClick={() =>
            void window.api.open("mailto:contacto@vortexstudio.es")
          }
        >
          contacto@vortexstudio.es
        </a>
      </article>
    </section>
  );
}
