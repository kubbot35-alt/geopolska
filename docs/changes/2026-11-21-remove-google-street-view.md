# Usunięcie pozostałości Google Street View / Google Maps SDK (2026-11-21)

## Zakres zmiany
Usunięto wszystkie pozostałości logiki, typów, nazw, komunikatów i zależności związanych z Google Street View / Google Maps SDK, tak aby kod w pełni odzwierciedlał architekturę gry opartą na statycznych fotografiach oraz darmowej mapie Leaflet/OpenStreetMap.

## Wprowadzone zmiany
- **Domena i maszyna stanów (`src/domain/types.ts`, `src/domain/gameMachine.ts`)**:
  - Usunięto nieużywany typ `StreetViewMovementMode` (`move` / `no_move` / `nmpz`), stałą `STREET_VIEW_MODE_OPTIONS`, interfejs `StreetViewModeOption` oraz pole `movementMode` ze wszystkich stanów gry.
  - Usunięto nieużywane komendy `SET_MOVEMENT_MODE` i `SYNC_PANORAMA_COORDINATE`.
  - Zmieniono nazwę pola `panoramaReloadNonce` na `imageReloadNonce` oraz komendy `RETRY_STREET_VIEW` na `RETRY_LOCATION_IMAGE`.
  - Zaktualizowano komunikaty losowania zastępczej lokalizacji tak, aby odnosiły się do zdjęć statycznych zamiast Street View.
- **Komponent mapy (`src/components/map/PolandMap.tsx`)**:
  - Zmieniono nazwę pliku i komponentu z `PolandGoogleMap` (`PolandGoogleMapProps`) na `PolandMap` (`PolandMapProps`) oraz usunięto nieużywany prop `apiKey`.
  - Zaktualizowano importy w `PlayingMapDock.tsx`, `RoundResultOverlay.tsx` oraz `SummaryScreen.tsx`.
- **Konfiguracja i zależności**:
  - Usunięto nieużywaną zależność `@vis.gl/react-google-maps` z `package.json`.
  - Usunięto zmienną `VITE_GOOGLE_MAPS_API_KEY` z `.env.example`.
  - Zaktualizowano opisy w `index.html` i `metadata.json`.
