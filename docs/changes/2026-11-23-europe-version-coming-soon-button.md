# Dodanie zablokowanego przycisku „Wersja Europa” z komunikatem „Wkrótce”

**Data:** 2026-11-23  
**Zakres:** Dodanie w menu głównym zablokowanego przycisku zapowiadającego tryb europejski wraz z komunikatem informacyjnym po kliknięciu.

## Wprowadzone zmiany

- **`src/components/game/EuropeVersionButton.tsx`**: utworzono wyizolowany komponent przycisku „Wersja Europa” oznaczonego jako zablokowany (`aria-disabled="true"`, ikona kłódki i globusa, stonowany styl). Po kliknięciu wyświetla dostępny dla czytników ekranu (`role="status"`, `aria-live="polite"`) komunikat **„Wkrótce!”** z automatycznym wygaszaniem po 4 sekundach.
- **`src/components/game/TitleMenuCard.tsx`**: osadzono `EuropeVersionButton` pod głównymi przyciskami startowymi w panelu konfiguracji gry.
