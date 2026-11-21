# Zmiana: Przeprojektowanie menu głównego GeoPolska (Atlas 3D) i ulepszenie sceny 3D

**Data**: 2026-11-21
**Zakres**: Interfejs ekranu startowego (glassmorphism + układ lewostronny + siatka kategorii 2×3) oraz warstwa wizualna i kamera sceny Three.js Polski.

## Podsumowanie zmian

1. **Integracja menu ze sceną 3D (układ asymetryczny + responsywność)**:
   - Przeniesiono główny panel startowy (logo `GeoPolska`, podsumowanie rund i puli, opis, wybór trybu `Swobodny`/`60 s`, wybór liczby rund, kategorie oraz przyciski `Rozpocznij grę` i `Wyzwanie Dnia`) na lewą stronę ekranu w formie półprzezroczystej karty glassmorphism (`backdrop-filter: blur(14px)`, tło `rgba(10, 15, 22, 0.72)`, ramka `1px rgba(255, 255, 255, 0.08)`).
   - Odsłonięto prawą część viewportu na desktopie (`>= 1024px`), zachowując układ pionowy z kartą glassmorphism nad pełnoekranową sceną 3D na urządzeniach mobilnych.
   - Dodano płynnie tłumione poziome przesunięcie kadru kamery (`PerspectiveCamera.setViewOffset` w `CameraRigController`), które ustawia makietę 3D Polski idealnie obok karty menu, a po przełączeniu w „Widok 3D” lub na urządzeniach mobilnych płynnie centruje scenę.

2. **Ulepszenia atmosfery i oświetlenia sceny 3D**:
   - **Szmaragdowa poświata granic**: Rozszerzono kontur Polski o dwuwarstwową, subtelną poświatę (addytywna otoczka oraz pionowa półprzezroczysta kurtyna świetlna wzdłuż granic) wspieraną przez wzmocnione światło kontrowe (`DirectionalLight` w kolorze `#10B981`).
   - **Miękkie cienie kierunkowe**: Podniesiono rozdzielczość mapy cieni głównego światła kierunkowego do `2048×2048` (na GPU) z `PCFSoftShadowMap`, parametrem `shadow.radius` oraz ciasnym frustum obejmującym latarnię na Helu, góry Tatry, budynki miast i lasy.
   - **Mgła horyzontalna i wygaszanie siatki**: Dopasowano `THREE.FogExp2(0x090e14, 0.044)` oraz rozdzielono podłogę na nieprzezroczystą powierzchnię przyjmującą cienie i warstwę siatki kartograficznej z radialną maską zanikania.
   - **Wolny ruch kamery, paralaksa i drobiny światła**: Spowolniono ruch orbitalny kamery, dostrojono tłumioną paralaksę kursora myszy (z obsługą `prefers-reduced-motion`) oraz dodano warstwę 96 subtelnych, unoszących się nad Polską cząsteczek światła (`polandParticlesLayer.ts`).

3. **Czytelność UI i spójny styl glassmorphism**:
   - Uporządkowano 6 kategorii lokalizacji w równą siatkę `2×3` (`grid-cols-2`) z nazwą po lewej i tabelarycznym licznikiem po prawej.
   - Dodano efekt podświetlenia (glow) na hover dla przycisku `Rozpocznij grę` oraz subtelną złotą obwódkę i złoty refleks hover na przycisku `Wyzwanie Dnia`.
   - Nadano spójny styl glassmorphism górnemu paskowi (`TitleTopBar`, `PWAInstallButton`) oraz dolnemu przełącznikowi sceny 3D (`TitleCameraDock`).

## Architektura i zgodność z SOLID

- Zrefaktoryzowano monolityczne komponenty `TitleScreen` (407 linii) i `PolandReliefScene` (497 linii) na wyspecjalizowane moduły o pojedynczej odpowiedzialności (`<= 200` linii każdy):
  - UI: `titleStyles.ts`, `TitleTopBar.tsx`, `TitleMenuCard.tsx`, `TitleCameraDock.tsx`, `TitleScreen.tsx`.
  - 3D: `sceneTypes.ts`, `cameraRigController.ts`, `polandTerrainBuilder.ts`, `polandAtmosphereBuilder.ts`, `polandParticlesLayer.ts`, `webglRendererUtils.ts`, `PolandReliefScene.tsx`.
- Zastosowano programowanie do interfejsów (`ICameraRigController`, `IAtmosphereLayer`, `IPolandTerrainLayer`, `IDisposableLayer`) bez użycia typu `any`.
