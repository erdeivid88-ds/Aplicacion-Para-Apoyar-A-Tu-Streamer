import { useEffect, useState } from "react";
import {
  defaultAutomation,
  type AppState,
  type Platform,
  type Streamer,
} from "../domain/types";
import { TWITCH_REDIRECT_URI } from "../domain/twitch-oauth";
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
          Monitor: <b>{state.monitor.status}</b>
        </header>
        {page === "Inicio" && <Home state={state} />}{" "}
        {page === "Plataformas" && <Platforms state={state} />}{" "}
        {page === "Streamers" && <Streamers state={state} />}{" "}
        {page === "Ajustes" && <Settings state={state} />}{" "}
        {page === "Actividad" && <Activity state={state} />}{" "}
        {page === "Contacto" && <Contact />}
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
          <button className="danger" onClick={() => void window.api.stop()}>
            Apagar monitor
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
function Platforms({ state }: { state: AppState }) {
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
                void window.api.saveSettings({
                  platforms: {
                    ...state.settings.platforms,
                    twitch: { ...twitch, clientId: event.target.value },
                  },
                })
              }
            />
          </label>
          <p>
            URL de redirección que debes registrar en Twitch Developer Console:
          </p>
          <p>
            <code>{TWITCH_REDIRECT_URI}</code>
          </p>
          <button onClick={() => void window.api.copy(TWITCH_REDIRECT_URI)}>
            Copiar URL de redirección
          </button>
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
              Conectar
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
  const settings = state.settings;
  const save = (value: Partial<AppState["settings"]>) =>
    void window.api.saveSettings(value);
  return (
    <section>
      <h2>Ajustes</h2>
      <div className="form settings">
        <label>
          Intervalo del monitor
          <input
            type="number"
            min="5"
            value={settings.scanMinutes}
            onChange={(event) =>
              save({ scanMinutes: Math.max(5, +event.target.value) })
            }
          />
        </label>
        <label>
          Navegador
          <select
            value={settings.browserMode}
            onChange={(event) =>
              save({ browserMode: event.target.value as "default" | "managed" })
            }
          >
            <option value="default">Predeterminado</option>
            <option value="managed">Gestionado (silenciado)</option>
          </select>
        </label>
        {(
          [
            "startup",
            "startMinimized",
            "minimizeToTray",
            "notifications",
            "closeManagedTabs",
          ] as const
        ).map((key) => (
          <Check
            key={key}
            label={key}
            checked={settings[key]}
            set={(value) => save({ [key]: value })}
          />
        ))}
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
