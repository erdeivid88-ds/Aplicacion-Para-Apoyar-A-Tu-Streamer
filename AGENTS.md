# Guía del repositorio

- Mantén TypeScript estricto y la separación `electron/` (privilegiado), `src/domain/` (lógica) y `src/ui/` (renderer).
- Nunca expongas Node al renderer ni registres tokens.
- Toda apertura externa pasa por la lista permitida del proceso principal.
- Añade pruebas para cambios en monitorización, importación o normalización.
- No añadas automatización de chat, cookies, antifraude ni espectadores.
