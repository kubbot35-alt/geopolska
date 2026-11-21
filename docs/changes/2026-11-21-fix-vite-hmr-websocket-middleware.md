# Poprawka: Błąd połączenia WebSocket Vite w trybie middleware Express (`server.ts`)

**Data**: 2026-11-21
**Problem**: Klient `@vite/client` zgłaszał błąd `Error: WebSocket closed without opened.`, ponieważ Vite uruchamiany w `server: { middlewareMode: true }` w `server.ts` nie miał podpiętego współdzielonego serwera HTTP na porcie 3000.

## Rozwiązanie

- Utworzono jawny `http.createServer(app)` w `server.ts` i przekazano konfigurację `hmr: process.env.DISABLE_HMR === 'true' ? false : {server: httpServer}` do `createViteServer(...)`.
- Gdy `DISABLE_HMR=true`, HMR pozostaje wyłączony bez prób otwierania WebSocket. Gdy HMR jest aktywny, połączenie WebSocket jest obsługiwane bezpośrednio na porcie 3000 zamiast nieosiągalnego osobnego portu.
