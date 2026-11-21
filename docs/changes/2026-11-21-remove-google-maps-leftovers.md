# Całkowite usunięcie pozostałości Google Maps Platform / Google Maps Grounding (2026-11-21)

## Zakres zmiany
Usunięto wszystkie pozostałe ślady po nieaktywnej integracji Google Maps Platform / Google Maps, w tym katalog pamięci podręcznej `.gmp_cache`, niedziałającą zakładkę Google Maps w Eksploratorze AI oraz powiązane endpointy serwerowe.

## Usunięte elementy
- **Katalog pomocniczy**: usunięto katalog `/.gmp_cache` (pliki cache/szablony Google Maps Platform).
- **UI (`src/components/game/AiExplorerDrawer.tsx`, `src/components/game/RoundResultOverlay.tsx`)**: usunięto zakładkę „W pobliżu (Maps)” i wszystkie odwołania do Google Maps, pozostawiając działające zakładki „Aktualności (Search)” oraz „Detektyw AI”.
- **Domena i bramka AI (`src/domain/types.ts`, `src/infrastructure/ai/aiExplorerGateway.ts`)**: usunięto typ `AiMapsNearbyResult`, schemat `MapsNearbyResponseSchema` oraz metodę `fetchNearbyMapsPlaces` z `IAiExplorerGateway`.
- **Serwer API (`server.ts`)**: usunięto endpoint `POST /api/ai/maps-nearby` (narzędzie `googleMaps`), schemat `MapsNearbySchema` oraz nieużywany endpoint `GET /api/config/public`.
