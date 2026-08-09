import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("experiencia pública 1.1.0", () => {
  it("incluye las siete áreas principales", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    for (const page of [
      "Inicio",
      "Streamers",
      "Cuentas",
      "Navegador",
      "Actividad",
      "Guía rápida",
      "Ajustes",
    ])
      expect(app).toContain(`"${page}"`);
  });
  it("incluye onboarding guiado, wizard y explicaciones de navegador", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    for (const text of [
      "Bienvenido a Apoya a tu Streamer",
      "Paso {step + 1} de 5",
      "Conecta tu cuenta de Twitch",
      "Conecta tu cuenta de Kick",
      "http://localhost:17654/oauth/kick/callback",
      "Navegador normal",
      "Navegador con extensión",
      "Navegador integrado",
      "Streamer añadido",
      "Añadir otro",
    ])
      expect(app).toContain(text);
  });
  it("presenta actualizaciones y novedades en modales centrales", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    for (const text of [
      "Nueva actualización disponible",
      "Descargando actualización",
      "Reiniciar e instalar",
      "Novedades de la versión",
      "Más tarde",
    ])
      expect(app).toContain(text);
  });
  it("ofrece estados vacíos, onboarding y ayuda de IDs", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    const support = await readFile("src/domain/support.ts", "utf8");
    expect(app).toContain("Todavía no has añadido ningún streamer");
    expect(app).toContain("Onboarding");
    expect(support).toContain("https://ids.vortexstudio.es");
    expect(app).toContain("Abrir Vortex IDs");
  });
  it("separa la instalación pública, la de prueba y el soporte", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    for (const text of [
      "Configurar extensión",
      "Google Chrome",
      "Microsoft Edge",
      "La extensión ya está incluida",
      "Registrar conector",
      "Ya la he cargado",
      "Informar sobre un error",
      "Copiar diagnóstico seguro",
    ])
      expect(app).toContain(text);
    expect(app).not.toMatch(
      /Abrir tienda|Instalar desde la tienda|todavía no está disponible en la tienda/i,
    );
    expect(app.match(/<IdHelp \/>/g)?.length).toBe(1);
  });
  it("guarda automáticamente con debounce y revisiones", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    const components = await readFile("src/ui/components.tsx", "utf8");
    expect(components).toContain("Guardando");
    expect(components).toContain("Guardado");
    expect(components).toContain("No se pudo guardar");
    expect(app).toContain("revision.current");
    expect(app).toContain("550");
  });
  it("recupera la guía de Twitch 1.0.7 en las ubicaciones públicas", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    for (const text of [
      "Crear una aplicación en Twitch",
      "Twitch Developer Console",
      "Público",
      "Device Code Flow",
      "No pegues aquí un Client Secret",
      "¿Cómo consigo mi Client ID?",
      "Ver cómo crear la aplicación de Twitch",
    ])
      expect(app).toContain(text);
    expect(app).not.toContain("https://dev.twitch.tv/console/apps");
    expect(app.match(/<TwitchGuideButton/g)?.length).toBeGreaterThanOrEqual(3);
    expect(app).toContain("function OnboardingTwitch");
  });
  it("incluye accesibilidad, temas y responsive sin overflow horizontal", async () => {
    const [app, css] = await Promise.all([
      readFile("src/ui/App.tsx", "utf8"),
      readFile("src/ui/styles.css", "utf8"),
    ]);
    expect(app).toContain('aria-label="Navegación principal"');
    expect(app).toContain('role="status"');
    expect(css).toContain('data-theme="dark"');
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("max-width: 760px");
  });
  it("aplica el command center premium sin dependencias visuales externas", async () => {
    const [app, components, css] = await Promise.all([
      readFile("src/ui/App.tsx", "utf8"),
      readFile("src/ui/components.tsx", "utf8"),
      readFile("src/ui/styles.css", "utf8"),
    ]);
    expect(app).toContain("command-dashboard");
    expect(app).toContain("system-health");
    expect(app).toContain("topbar-connections");
    expect(components).toContain('className="ui-icon"');
    for (const token of [
      "--bg-primary",
      "--surface-hover",
      "--glass",
      "--border-hover",
      "--text-primary",
      "--radius-xl",
      "--shadow-lg",
      "--transition-normal",
    ])
      expect(css).toContain(token);
    expect(css).toContain("monitor-pulse");
    expect(css).toContain("grid-template-columns: 76px minmax(0, 1fr)");
  });
});
