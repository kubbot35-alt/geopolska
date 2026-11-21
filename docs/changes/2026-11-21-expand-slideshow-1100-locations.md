# Zmiana: Rozszerzenie pokazu slajdów menu głównego do 1 100 lokalizacji Polski z 2-slotowym buforem i cache PWA

**Data**: 2026-11-21
**Zakres**: Podłączenie pełnego lokalnego katalogu 1 100 lokalizacji do pokazu slajdów menu głównego, algorytm losowy bez powtórek (Fisher-Yates), 2-slotowy bufor DOM z preloadem i automatycznym pomijaniem błędów oraz reguła Workbox PWA `CacheFirst`.

## Podsumowanie zmian

1. **Pełna pula 1 100+ lokalizacji w domenie (`src/domain/titleBackdropSlides.ts`)**:
   - Rozszerzono `buildTitleBackdropSlides(locations)` o pełny lokalny katalog `POLAND_LOCATIONS` (1 100 miejsc) oraz ewentualne lokalizacje zsynchronizowane z Firestore.
   - Znormalizowano ścieżki obrazów tak, aby lokalizacje z nieobecnymi lokalnie ścieżkami statycznymi automatycznie korzystały z lokalnego proxy `/api/location-photo/image` (1280 px).
   - Zaimplementowano tasowanie Fisher-Yates (`createShuffledSlideDeck` / `ISlideDeckCursor`) z otwierającym slajdem ze sprawdzonych miejsc krajobrazowych i pełnym cyklem bez powtórek.
   - Dodano formatowanie podpisu z nazwą i województwem (`formatSlideCaption`) dla czytelności mniejszych miejscowości.

2. **Wydajny 2-slotowy bufor i wyprzedzające ładowanie (`src/hooks/usePhotoSlideshow.ts`, `PhotoBackdropSlideshow.tsx`)**:
   - Zastąpiono renderowanie wszystkich slajdów jednocześnie stabilnym buforem ping-pong (`slots[0]`, `slots[1]`) — w DOM istnieją zawsze maksymalnie 2 elementy `<img>`.
   - Dodano preload kolejnego zdjęcia poza ekranem (`new Image()` + `img.decode()` + limit czasu 12 s) przed wykonaniem płynnego crossfade (1400 ms co 9 s) z efektem Ken Burns.
   - Wdrożono ciche, automatyczne pomijanie lokalizacji bez dostępnego zdjęcia (z bezpiecznikiem maks. 16 prób pod rząd w trybie offline oraz automatycznym wznowieniem po powrocie połączenia `online`) i wstrzymywanie pobierania w ukrytych kartach przeglądarki (`document.hidden`).

3. **Buforowanie zdjęć w PWA Service Worker (`vite.config.ts`)**:
   - Dodano regułę `runtimeCaching` (`CacheFirst`) dla `/api/location-photo/image` (`geopolska-location-photos-cache`, maks. 180 zdjęć LRU, ważność 30 dni, wyłącznie odpowiedzi HTTP `200`).
