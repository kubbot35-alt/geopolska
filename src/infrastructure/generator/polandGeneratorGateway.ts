import {normalizeGeneratedLocationInput} from '../../domain/polandGeneratorSanitizer';
import type {
  IPolandGeneratorGateway,
  VoivodeshipGenerationRequest,
  VoivodeshipGenerationResponse,
} from '../../domain/polandGeneratorTypes';
import type {PolandLocation, Result} from '../../domain/types';

interface RawApiResponse {
  readonly voivodeship?: string;
  readonly locations?: readonly unknown[];
  readonly photoYears?: Readonly<Record<string, number>>;
  readonly stats?: VoivodeshipGenerationResponse['stats'];
  readonly error?: string;
}

export class HttpPolandGeneratorGateway implements IPolandGeneratorGateway {
  async generateForVoivodeship(
    request: VoivodeshipGenerationRequest,
    signal?: AbortSignal,
  ): Promise<Result<VoivodeshipGenerationResponse, string>> {
    try {
      const response = await fetch('/api/location-generator/voivodeship', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(request),
        signal,
      });
      const payload = (await response.json()) as RawApiResponse;
      if (!response.ok) {
        return {
          ok: false,
          error: payload.error ?? `Błąd generatora (HTTP ${response.status}).`,
        };
      }
      const normalized: PolandLocation[] = [];
      for (const rawItem of payload.locations ?? []) {
        const clean = normalizeGeneratedLocationInput(rawItem);
        if (clean) {
          normalized.push(clean);
        }
      }
      return {
        ok: true,
        value: {
          voivodeship: payload.voivodeship ?? request.voivodeship,
          locations: normalized,
          photoYears: payload.photoYears ?? {},
          stats: payload.stats ?? {
            rawCandidates: normalized.length,
            verifiedImages: normalized.length,
            freshPhotoCount: 0,
            accepted: normalized.length,
            rejectedQuality: 0,
            rejectedDuplicate: 0,
          },
        },
      };
    } catch (error: unknown) {
      if (signal?.aborted) {
        return {ok: false, error: 'Generowanie przerwane przez użytkownika.'};
      }
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Nie udało się połączyć z endpointem generatora lokalizacji.',
      };
    }
  }
}

export const polandGeneratorGateway = new HttpPolandGeneratorGateway();
