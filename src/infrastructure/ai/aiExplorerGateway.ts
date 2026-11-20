import {z} from 'zod';
import type {
  AiAnimateVideoRequest,
  AiAnimateVideoResult,
  AiDeepAnalysisResult,
  AiMapsNearbyResult,
  AiSearchFactsResult,
  AiThemedChallengeResult,
  ChallengeCandidateSummary,
  ChallengeRoundCountOption,
  IAiExplorerGateway,
  PolandLocation,
  Result,
  RoundOutcome,
} from '../../domain/types';

const GroundingLinkSchema = z.object({
  title: z.string(),
  uri: z.string(),
  snippet: z.string().optional(),
});

const SearchFactsResponseSchema = z.object({
  markdown: z.string(),
  sources: z.array(GroundingLinkSchema),
});

const MapsNearbyResponseSchema = z.object({
  markdown: z.string(),
  places: z.array(GroundingLinkSchema),
});

const DeepAnalysisResponseSchema = z.object({
  markdown: z.string(),
  model: z.string(),
});

const ThemedChallengeResponseSchema = z.object({
  title: z.string().min(2),
  briefing: z.string().min(5),
  stops: z.array(
    z.object({
      locationId: z.string().min(1),
      customClue: z.string(),
    }),
  ).min(1),
  model: z.string(),
});

const AnimateVideoResponseSchema = z.object({
  videoDataUrl: z.string().min(10),
  mimeType: z.string().min(3),
  aspectRatio: z.enum(['16:9', '9:16']),
  model: z.string(),
});

const ErrorPayloadSchema = z.object({
  error: z.string().optional(),
});

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<Result<T, string>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal,
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const parsedErr = ErrorPayloadSchema.safeParse(raw);
      return {
        ok: false,
        error: parsedErr.success && parsedErr.data.error
          ? parsedErr.data.error
          : `Błąd serwera AI (${response.status}).`,
      };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {ok: false, error: 'Otrzymano nieprawidłowy format danych z serwera AI.'};
    }
    return {ok: true, value: parsed.data};
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {ok: false, error: 'Zapytanie zostało anulowane.'};
    }
    return {
      ok: false,
      error: 'Brak połączenia z serwerem AI. Sprawdź połączenie sieciowe.',
    };
  }
}

export class HttpAiExplorerGateway implements IAiExplorerGateway {
  fetchSearchFacts(
    location: PolandLocation,
    signal: AbortSignal,
  ): Promise<Result<AiSearchFactsResult, string>> {
    return postJson(
      '/api/ai/search-facts',
      {
        locationName: location.name,
        voivodeship: location.voivodeship,
      },
      SearchFactsResponseSchema,
      signal,
    );
  }

  fetchNearbyMapsPlaces(
    location: PolandLocation,
    signal: AbortSignal,
  ): Promise<Result<AiMapsNearbyResult, string>> {
    return postJson(
      '/api/ai/maps-nearby',
      {
        locationName: location.name,
        lat: location.lat,
        lng: location.lng,
      },
      MapsNearbyResponseSchema,
      signal,
    );
  }

  fetchDeepAnalysis(
    outcome: RoundOutcome,
    signal: AbortSignal,
  ): Promise<Result<AiDeepAnalysisResult, string>> {
    return postJson(
      '/api/ai/deep-analysis',
      {
        locationName: outcome.location.name,
        voivodeship: outcome.location.voivodeship,
        distanceKm: outcome.distanceKm,
        hint: outcome.location.hint,
        funFact: outcome.location.funFact,
      },
      DeepAnalysisResponseSchema,
      signal,
    );
  }

  generateThemedChallenge(
    themePrompt: string,
    region: string,
    roundCount: ChallengeRoundCountOption,
    candidates: readonly ChallengeCandidateSummary[],
    signal: AbortSignal,
  ): Promise<Result<AiThemedChallengeResult, string>> {
    return postJson(
      '/api/ai/themed-challenge',
      {themePrompt, region, roundCount, candidates},
      ThemedChallengeResponseSchema,
      signal,
    );
  }

  animateImageToVideo(
    request: AiAnimateVideoRequest,
    signal: AbortSignal,
  ): Promise<Result<AiAnimateVideoResult, string>> {
    return postJson(
      '/api/ai/animate-video',
      {
        ...(request.imageBase64 ? {imageBase64: request.imageBase64} : {}),
        ...(request.mimeType ? {mimeType: request.mimeType} : {}),
        ...(request.locationImageUrl ? {locationImageUrl: request.locationImageUrl} : {}),
        ...(request.locationName ? {locationName: request.locationName} : {}),
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
      },
      AnimateVideoResponseSchema,
      signal,
    );
  }
}

export const aiExplorerGateway = new HttpAiExplorerGateway();
