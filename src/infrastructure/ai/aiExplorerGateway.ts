import {z} from 'zod';
import type {
  AiDeepAnalysisResult,
  AiSearchFactsResult,
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

const DeepAnalysisResponseSchema = z.object({
  markdown: z.string(),
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
}

export const aiExplorerGateway = new HttpAiExplorerGateway();
