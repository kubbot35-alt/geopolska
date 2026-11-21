# Zmiana: Usunięcie sceny 3D (Three.js) i przejście na pełnoekranowe tło fotograficzne menu głównego

**Data**: 2026-11-21
**Zakres**: Całkowite usunięcie implementacji i zależności Three.js, wdrożenie pełnoekranowego pokazu slajdów prawdziwych zdjęć Polski z efektem Ken Burns oraz minimalistyczne odświeżenie UI ekranu startowego.

## Podsumowanie zmian

1. **Całkowite usunięcie Three.js i sceny 3D**:
   - Usunięto katalog `src/components/three/` (w tym `PolandReliefScene`, generator zabytków 3D, kontroler kamery, warstwę atmosfery i cząsteczek).
   - Usunięto dolny pasek przełączania scen 3D (`TitleCameraDock.tsx`) oraz typ `ThreeCameraPreset` z `src/domain/types.ts`.
   - Usunięto nieużywane pakiety `three` i `@types/three` z `package.json`.

2. **Pełnoekranowy pokaz prawdziwych zdjęć Polski (`PhotoBackdropSlideshow`)**:
   - Utworzono czysty moduł domenowy `src/domain/titleBackdropSlides.ts` kuratorujący 6 lokalnych fotografii z bazy lokacji (działają w 100% offline): **Tatry i Zakopane**, **Warszawa**, **Gdańsk**, **Zamek w Malborku**, **Półwysep Hel** oraz **Kraków**.
   - Zaimplementowano płynny crossfade co 9 sekund (`duration-[1400ms]`) z subtelnym efektem **Ken Burns** w czystym CSS (`scale(1.0) → scale(1.06)` przez `10.5s`, wyłączanym automatycznie przy `prefers-reduced-motion`).
   - Zamiast ciemnego pudełka pod menu nałożono płynny lewostronny gradient (`linear-gradient(90deg, rgba(12,14,18,0.92) 0%, rgba(12,14,18,0.65) 42%, rgba(12,14,18,0.1) 100%)`), zapewniający pełną czytelność po lewej i odsłonięty krajobraz po prawej stronie.
   - Dodano minimalistyczny podpis aktualnej lokalizacji w prawym dolnym rogu (ikona pinezki + nazwa miejsca i współrzędne w formacie `49.299°N, 19.950°E`).

3. **Minimalistyczne odświeżenie UI**:
   - Usunięto neonowe poświaty (glow), szmaragdową zieleń jako kolor dominujący w menu głównym, siatkę w tle oraz ciężki glassmorphism (`backdrop-blur-[14px]`).
   - Wprowadzono wysokokontrastowy biały przycisk główny **„Rozpocznij grę”** z ciemnym tekstem (`#0C0E12`) oraz stonowany **ciepły bursztyn** jako pojedynczy akcent dla przycisku **„Wyzwanie Dnia”**.
   - Przeprojektowano siatkę kategorii `2×3`, przełączniki trybu/rund oraz górny pasek (`TitleTopBar`, `PWAInstallButton`) na płaskie, minimalistyczne kontrolki w półprzezroczystej czerni z delikatną krawędzią.
