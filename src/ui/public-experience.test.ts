import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("experiencia pública 1.1.0", () => {
  it("incluye las siete áreas principales", async () => {
    const app = await readFile("src/ui/App.tsx", "utf8");
    for (const page of [
      "Inicio",
      "Streamers",
      "Plataformas",
      "Automatizaciones",
      "Navegador",
      "Actividad",
      "Ajustes",
    ])
      expect(app).toContain(`"${page}"`);
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
    for (const text of ["Configurar extensión", "Google Chrome", "Microsoft Edge", "La extensión ya está incluida", "Registrar conector", "Ya la he cargado", "Informar sobre un error", "Copiar diagnóstico seguro"]) expect(app).toContain(text);
    expect(app).not.toMatch(/Abrir tienda|Instalar desde la tienda|todavía no está disponible en la tienda/i);
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
});
