import type {CatalogMetaSnapshot, PolandLocation, Result} from './types';

export interface VoivodeshipConfig {
  readonly name: string;
  readonly qid: string;
}

export const POLISH_VOIVODESHIP_CONFIGS: readonly VoivodeshipConfig[] = [
  {name: 'Dolnośląskie', qid: 'Q54150'},
  {name: 'Kujawsko-Pomorskie', qid: 'Q54153'},
  {name: 'Lubelskie', qid: 'Q54155'},
  {name: 'Lubuskie', qid: 'Q54157'},
  {name: 'Łódzkie', qid: 'Q54158'},
  {name: 'Małopolskie', qid: 'Q54159'},
  {name: 'Mazowieckie', qid: 'Q54169'},
  {name: 'Opolskie', qid: 'Q54171'},
  {name: 'Podkarpackie', qid: 'Q54175'},
  {name: 'Podlaskie', qid: 'Q54177'},
  {name: 'Pomorskie', qid: 'Q54180'},
  {name: 'Śląskie', qid: 'Q54181'},
  {name: 'Świętokrzyskie', qid: 'Q54183'},
  {name: 'Warmińsko-Mazurskie', qid: 'Q54184'},
  {name: 'Wielkopolskie', qid: 'Q54187'},
  {name: 'Zachodniopomorskie', qid: 'Q54188'},
] as const;

export const DEFAULT_PER_VOIVODESHIP_LIMIT = 70;
export const MIN_PER_VOIVODESHIP_LIMIT = 10;
export const MAX_PER_VOIVODESHIP_LIMIT = 120;
export const GENERATOR_LIMIT_PRESETS: readonly number[] = [30, 70, 100] as const;

export type PhotoFreshnessMode = 'only_2025_2026' | 'prefer_2025_2026' | 'any';

export const DEFAULT_PHOTO_FRESHNESS: PhotoFreshnessMode = 'only_2025_2026';
export const FRESH_PHOTO_MIN_YEAR = 2025;
export const FRESH_PHOTO_MAX_YEAR = 2026;

export interface VoivodeshipGenerationRequest {
  readonly voivodeship: string;
  readonly limit: number;
  readonly excludeNames: readonly string[];
  readonly photoFreshness?: PhotoFreshnessMode;
}

export interface VoivodeshipGenerationStats {
  readonly rawCandidates: number;
  readonly verifiedImages: number;
  readonly freshPhotoCount: number;
  readonly accepted: number;
  readonly rejectedQuality: number;
  readonly rejectedDuplicate: number;
}

export interface VoivodeshipGenerationResponse {
  readonly voivodeship: string;
  readonly locations: readonly PolandLocation[];
  readonly photoYears: Readonly<Record<string, number>>;
  readonly stats: VoivodeshipGenerationStats;
}

export type VoivodeshipRunStatus = 'idle' | 'loading' | 'done' | 'error';

export interface VoivodeshipProgressState {
  readonly voivodeship: string;
  readonly status: VoivodeshipRunStatus;
  readonly collected: number;
  readonly rejected: number;
  readonly errorMessage: string | null;
}

export type CatalogReplacePhase = 'reading' | 'writing' | 'deleting' | 'meta';

export interface CatalogReplaceProgress {
  readonly phase: CatalogReplacePhase;
  readonly processed: number;
  readonly total: number;
}

export interface CatalogReplaceSummary {
  readonly meta: CatalogMetaSnapshot;
  readonly classicPreserved: number;
  readonly writtenCount: number;
  readonly deletedCount: number;
  readonly totalCount: number;
}

export interface IPolandGeneratorGateway {
  generateForVoivodeship(
    request: VoivodeshipGenerationRequest,
    signal?: AbortSignal,
  ): Promise<Result<VoivodeshipGenerationResponse, string>>;
}

export function findVoivodeshipConfig(name: string): VoivodeshipConfig | null {
  const normalized = name.trim().toLowerCase();
  return (
    POLISH_VOIVODESHIP_CONFIGS.find((cfg) => cfg.name.toLowerCase() === normalized) ?? null
  );
}
