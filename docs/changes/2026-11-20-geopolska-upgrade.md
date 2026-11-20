# GeoPolska — Rozbudowa gry (2026-11-20)

## Zakres wdrożonych zmian

1. **Wyzwanie Dnia z Rankingiem Dziennym**
   - Dodano deterministyczny generator 5-rundowej talii dziennej (`src/domain/dailyChallenge.ts`) oparty o kalendarzową datę `Europe/Warsaw` (`YYYY-MM-DD`) i PRNG `mulberry32`.
   - Rozszerzono kolekcje Firestore o niemutowalną kolekcję `/dailyLeaderboard/{entryId}` (`{YYYY-MM-DD}_{uid}`, jedna oficjalna próba dziennie, brak PII) oraz zaktualizowano `firebase-blueprint.json`, `firestore.rules` i `FirestoreGameRepository`.
   - Dodano zakładkę **Wyzwanie Dnia** w `LeaderboardHistoryModal` oraz dedykowany przycisk startowy i status ukończenia na ekranie głównym.

2. **Ulepszona scena 3D PBR zabytków Polski (Three.js)**
   - Wydzielono moduł `src/components/three/polandLandmarksBuilder.ts` z 6 wieloczęściowymi proceduralnymi modelami zabytków (Warszawa, Kraków — Bazylika Mariacka, Gdańsk — Żuraw, Malbork, latarnia morska na Helu z obracającą się wiązką światła, Tatry/Zakopane), cieniami kontaktowymi, mapą reliefu topograficznego i zgrupowanymi lasami `InstancedMesh`.
   - Dodano płynne przejścia kamery (`Cała Polska`, `Warszawa`, `Gdańsk i Hel`, `Kraków i Tatry`) oraz przełącznik `Widok 3D` na ekranie startowym.

3. **Studio Wideo AI (`16:9` i `9:16`, Gemini Interactions API)**
   - Dodano serwerowy endpoint `POST /api/ai/animate-video` korzystający z `ai.interactions.create` (`gemini-omni-1.2-flash`), obsługujący zarówno przesłane zdjęcia użytkownika (JPG/PNG/WebP), jak i kadry lokalizacji z gry.
   - Dodano modal `VideoStudioModal` dostępny z paska górnego ekranu głównego oraz bezpośrednio z ekranu wyniku rundy (`Animuj kadr w wideo`).

4. **Przełącznik widoku Google Maps (`Ciemna`, `Satelita`, `Teren`)**
   - Rozbudowano `PolandGoogleMap` o wbudowany przełącznik stylów (`roadmap` dark, `hybrid`, `terrain`) spójnie zapamiętywany między rundami w grze, podsumowaniu rundy i ekranie końcowym.
   - Ujednolicono ładowanie Google Maps Platform przez współdzielony `<APIProvider>` w `App.tsx` dla `StreetViewExplorer` (tryby `Ruch`, `No Move`, `NMPZ`) oraz `PolandGoogleMap`.
