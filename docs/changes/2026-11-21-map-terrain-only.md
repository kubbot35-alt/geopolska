# Uproszczenie mapy Polski wyłącznie do warstwy Teren (2026-11-21)

## Zakres zmiany
Usunięto przełącznik oraz warstwy mapy **Ciemna** (CartoDB Dark) i **Satelita** (Esri World Imagery), ustawiając działającą warstwę **Teren** (OpenTopoMap) jako jedyną domyślną warstwę mapy we wszystkich widokach gry.

## Wprowadzone zmiany
- **`src/components/map/PolandMap.tsx`**: usunięto konfigurację warstw `Ciemna` i `Satelita`, panel zakładek przełączania stylu mapy oraz propsy `mapStyle` / `onChangeMapStyle`; warstwa `OpenTopoMap` (`TERRAIN_TILE_LAYER`) jest ładowana bezpośrednio przy inicjalizacji mapy Leaflet.
- **`src/domain/types.ts`**: usunięto nieużywany typ `MapStyleOption`.
- **`src/App.tsx`, `PlayingMapDock.tsx`, `RoundResultOverlay.tsx`, `SummaryScreen.tsx`**: usunięto stan `mapStyle` i przekazywanie propsów stylu mapy.
