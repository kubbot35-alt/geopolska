# Poprawka: Błąd połączenia WebSocket Vite w trybie middleware Express (`server.ts`)

**Data**: 2026-11-21
**Problem**: W Vite 8 uruchamianym w `server: { middlewareMode: true }` klient `/@vite/client` bezwarunkowo wywoływał `transport.connect(...)` pod port `24678` (nieosiągalny przez reverse proxy portu 3000), powodując błąd `Error: WebSocket closed without opened.` w konsoli przeglądarki.

## Rozwiązanie

- W `server.ts` ustawiono `ws: false` oraz `hmr: false` w trybie middleware (z możliwością jawnego włączenia lokalnie przez `ENABLE_HMR=true`).
- Gdy HMR jest wyłączony, trasa `GET /@vite/client` przed `vite.middlewares` pobiera przetransformowany moduł klienta z Vite i usuwa wywołanie startowe `transport.connect(createHMRHandler(handleMessage));`, zachowując wszystkie wymagane eksporty CSS/JS (`createHotContext`, `updateStyle`, `removeStyle`, `injectQuery`, `ErrorOverlay`).
- Zweryfikowano odpowiedzią `curl http://localhost:3000/@vite/client`, kompilacją produkcyjną oraz sprawdzeniem typów TypeScript.
