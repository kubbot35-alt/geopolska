# Usunięcie Kreatora Wyzwań AI (2026-11-20)

## Zakres zmiany
Usunięto kompletną implementację oraz wszystkie wystąpienia funkcji **Kreator Wyzwań AI** z warstwy UI, logiki domenowej, klienta HTTP oraz serwera API.

## Usunięte elementy
- **UI / Komponenty**:
  - Usunięto modal `src/components/modals/ChallengeGeneratorModal.tsx`.
  - Usunięto przycisk „Kreator Wyzwań AI” oraz prop `onOpenChallengeCreator` z `src/components/game/TitleScreen.tsx`.
  - Usunięto stan `challengeCreatorOpen`, handler `handleStartChallengeDeck` i renderowanie modala z `src/App.tsx`.
- **Domena**:
  - Usunięto wariant `'custom'` z `GameMode` oraz typy `ChallengeRoundCountOption`, `ChallengeCandidateSummary`, `AiChallengeStop`, `AiThemedChallengeResult` i metodę `generateThemedChallenge` z `IAiExplorerGateway` w `src/domain/types.ts`.
  - Usunięto mapowanie `REGION_VOIVODESHIPS_MAP`, stałą `CHALLENGE_REGIONS` oraz funkcje `selectChallengeCandidates` i `hydrateChallengeDeck` z `src/domain/polandLocations.ts`.
- **Infrastruktura i backend**:
  - Usunięto metodę `generateThemedChallenge` i schemat `ThemedChallengeResponseSchema` z `src/infrastructure/ai/aiExplorerGateway.ts`.
  - Usunięto endpoint `POST /api/ai/themed-challenge` oraz powiązane schematy walidacji Zod z `server.ts`.
