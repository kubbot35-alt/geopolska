# Blokada przycisku „Baza Lokacji” kodem dostępu `2006`

**Data:** 2026-11-24  
**Zakres:** Zabezpieczenie otwierania panelu „Baza Lokacji” w menu głównym oknem weryfikacji kodu dostępu (`2006`).

## Wprowadzone zmiany

- **`src/domain/locationAccessGate.ts`**: zdefiniowano czysty interfejs domenowy `IAccessCodeVerifier` oraz implementację `StaticAccessCodeVerifier` (`locationDatabaseCodeVerifier` dla kodu `2006`).
- **`src/components/modals/LocationAccessCodeModal.tsx`**: utworzono dedykowany modal wprowadzania kodu dostępu (pole zamaskowane z klawiaturą numeryczną, walidacja przez wstrzyknięty `IAccessCodeVerifier`, obsługa `Escape`, komunikat błędu przy złym kodzie).
- **`src/components/game/TitleTopBar.tsx`, `TitleScreen.tsx`, `App.tsx`**: oznaczono przycisk „Baza Lokacji” ikoną kłódki do momentu odblokowania w bieżącej sesji oraz przekierowano kliknięcie przez modal weryfikacji kodu przed otwarciem `LocationDatabaseModal`.
