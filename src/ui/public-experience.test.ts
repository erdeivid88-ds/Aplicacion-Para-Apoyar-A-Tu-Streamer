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
    expect(app).toContain("Todavía no has añadido ningún streamer");
    expect(app).toContain("Onboarding");
    expect(app).toContain("https://ids.vortexstudio.es");
    expect(app).toContain("Abrir herramienta de IDs");
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
