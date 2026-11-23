# Rozszerzenie dostępnej liczby rund (30, 50 i 100 rund)

**Data:** 2026-11-23  
**Zakres:** Dodanie dłuższych trybów rozgrywki (30, 50 oraz 100 rund) w domenie, interfejsie menu głównego, buforach offline IndexedDB oraz regułach bezpieczeństwa i schemacie Cloud Firestore.

## Wprowadzone zmiany

1. **Domena (`src/domain/types.ts`, `src/domain/gameMachine.ts`)**:
   - Rozszerzono typ `RoundCountOption` oraz tablicę `ROUND_COUNT_OPTIONS` do `[3, 5, 10, 15, 20, 30, 50, 100]`.
   - Dodano czystą funkcję domenową `clampRoundCountToPool(selected, availableCount)` gwarantującą, że liczba rund w talii nigdy nie przekroczy liczby unikalnych lokalizacji w wybranej kategorii (np. `20` dla `Klasyczna 20 (offline)` lub `30` dla `Morze i jeziora`).
2. **Interfejs użytkownika (`TitleScreen.tsx`, `TitleMenuCard.tsx`, `App.tsx`, `LeaderboardHistoryModal.tsx`)**:
   - Przeprojektowano wiersz wyboru liczby rund na responsywną siatkę (`grid-cols-4 sm:grid-cols-8`) prezentującą wszystkie 8 opcji bez przepełniania.
   - Zablokowano opcje przekraczające rozmiar aktywnej puli kategorii oraz dodano automatyczne dopasowanie liczby rund przy przełączaniu kategorii.
   - Skrócono podgląd listy odwiedzonych miejsc w historii gier (`LeaderboardHistoryModal`) do 12 pierwszych lokalizacji z licznikiem pozostałych (`+N więcej`) dla długich partii.
3. **Firebase, Offline Outbox i bezpieczeństwo (`firestore.rules`, `firebase-blueprint.json`, `security_spec.md`, `firestoreGameRepository.ts`, `indexedDbOutbox.ts`, `guestProfileCache.ts`)**:
   - Zaktualizowano walidację `roundsCount` (`[3, 5, 10, 15, 20, 30, 50, 100]`), limit surowych punktów (`500 000`) oraz górny limit tablic rund (`<= 100`) w schematach Zod, `firebase-blueprint.json`, `security_spec.md` oraz `firestore.rules`.
   - Zweryfikowano reguły narzędziem `@firebase/eslint-plugin-security-rules` (0 błędów) i wdrożono zaktualizowane reguły do Firestore.
