# Usunięcie Studia Wideo AI (2026-11-21)

## Zakres zmiany
Usunięto kompletną implementację oraz wszystkie wystąpienia funkcji **Studio Wideo AI** (animowanie zdjęć w wideo) z interfejsu użytkownika, warstwy domenowej, klienta HTTP oraz serwera API.

## Usunięte elementy
- **UI / Komponenty**:
  - Usunięto modal `src/components/modals/VideoStudioModal.tsx`.
  - Usunięto przycisk „Studio Wideo AI”, ikonę `Film` i prop `onOpenVideoStudio` z `src/components/game/TitleScreen.tsx`.
  - Usunięto przycisk „Animuj kadr w wideo”, ikonę `Film` i prop `onAnimateLocation` z `src/components/game/RoundResultOverlay.tsx`.
  - Usunięto stany `videoStudioOpen` / `videoStudioLocation`, handler `handleOpenVideoStudio`, obsługę klawisza `Escape` oraz renderowanie modala z `src/App.tsx`.
- **Domena**:
  - Usunięto typy `VideoAspectRatio`, `AiAnimateVideoRequest`, `AiAnimateVideoResult` oraz metodę `animateImageToVideo` z interfejsu `IAiExplorerGateway` w `src/domain/types.ts`.
- **Infrastruktura i backend**:
  - Usunięto metodę `animateImageToVideo` oraz schemat `AnimateVideoResponseSchema` z `src/infrastructure/ai/aiExplorerGateway.ts`.
  - Usunięto stałą `VIDEO_OMNI_MODEL`, schemat `AnimateVideoSchema`, gałęzie `isVideoEndpoint` z `classifyGeminiError`, pomocniki `inferImageMimeType` i `resolveImageToBase64` oraz endpoint `POST /api/ai/animate-video` z `server.ts` (zmniejszono też limit `express.json` z `15mb` do `1mb`).
