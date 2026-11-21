# Poprawka: Błędy WebSocket oraz SendBeforeConnectError w `@vite/client` (`server.ts`)

**Data**: 2026-11-21
**Problem**:
1. W Vite 8 (`middlewareMode: true`) `/@vite/client` otwierał połączenie WebSocket na niedostępnym za proxy porcie `24678` (`Error: WebSocket closed without opened.`).
2. Samo usunięcie `transport.connect(...)` powodowało `SendBeforeConnectError: send was called before connect`, ponieważ `vite-plugin-pwa` w trybie dev wywołuje `import.meta.hot.send(...)` podczas rejestracji Service Workera.

## Rozwiązanie

- W `server.ts` w trasie `GET /@vite/client` (gdy HMR jest wyłączony) podmieniono transport WebSocket na synchroniczny transport no-op:
  `const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });`
- Dzięki pozostawieniu `transport.connect(createHMRHandler(handleMessage));` flaga `isConnected` w kliencie Vite ustawia się natychmiast na `true` bez otwierania żadnego gniazda WebSocket, dzięki czemu wywołania `import.meta.hot.send(...)` (np. z `vite-plugin-pwa`) kończą się czysto i bez błędów.
