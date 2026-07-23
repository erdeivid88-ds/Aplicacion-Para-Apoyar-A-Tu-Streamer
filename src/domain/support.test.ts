import { describe, expect, it } from "vitest";
import { defaults } from "./types";
import { errorReportMailto, errorReportTemplate, extensionStoreUrl, safeDiagnostic, SUPPORT_EMAIL, validExtensionStoreUrl } from "./support";

describe("soporte seguro", () => {
  it("genera un mailto codificado con destinatario y asunto correctos", () => {
    const url = new URL(errorReportMailto(defaults, "Windows"));
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(SUPPORT_EMAIL);
    expect(url.searchParams.get("subject")).toBe("Apoya a tu Streamer - Informe de error");
  });
  it("acepta solo las tiendas HTTPS oficiales", () => {
    expect(validExtensionStoreUrl("edge", "https://microsoftedge.microsoft.com/addons/detail/test")).toContain("https://");
    expect(validExtensionStoreUrl("chrome", "https://chromewebstore.google.com/detail/test")).toContain("https://");
    expect(validExtensionStoreUrl("edge", "edge://extensions")).toBe("");
    expect(validExtensionStoreUrl("chrome", "http://chromewebstore.google.com/test")).toBe("");
  });
  it("no incluye secretos ni datos privados", () => {
    const text = errorReportTemplate(defaults, "Windows") + JSON.stringify(safeDiagnostic(defaults, "Windows"));
    expect(text).not.toMatch(/token|client secret|appSessionId|authorization|streamers/i);
  });
  it("mantiene centralizadas y vacías las tiendas aún no publicadas", () => {
    expect(extensionStoreUrl("chrome")).toBe("");
    expect(extensionStoreUrl("edge")).toBe("");
  });
});
