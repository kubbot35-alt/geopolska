import type {
  RankingMode,
  RankingPlayerFilter,
  RankingPlayerType,
  Result,
  UnifiedRankingEntry,
} from './types';

export const GUEST_NICKNAME_MIN_LENGTH = 2;
export const GUEST_NICKNAME_MAX_LENGTH = 30;
export const STANDARD_DATE_KEY = 'all';

/**
 * Validates and normalizes an unauthenticated guest's nickname before persistence.
 */
export function validateGuestNickname(raw: string): Result<string, string> {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < GUEST_NICKNAME_MIN_LENGTH) {
    return {
      ok: false,
      error: `Nick musi mieć co najmniej ${GUEST_NICKNAME_MIN_LENGTH} znaki.`,
    };
  }
  if (cleaned.length > GUEST_NICKNAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Nick może mieć maksymalnie ${GUEST_NICKNAME_MAX_LENGTH} znaków.`,
    };
  }
  return {ok: true, value: cleaned};
}

/**
 * Sanitizes an actor identifier to strictly match Firestore ID rules `^[a-zA-Z0-9_-]+$`.
 */
export function sanitizeRankingActorId(rawActorId: string): string {
  const safe = rawActorId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return safe.length >= 4 ? safe : `anon_${Date.now().toString(36)}`;
}

/**
 * Computes the deterministic Firestore document ID for a ranking record,
 * guaranteeing separate records per player for standard mode vs each Daily Challenge day.
 */
export function buildRankingDocumentId(
  playerType: RankingPlayerType,
  actorId: string,
  gameMode: RankingMode,
  dateKey: string,
): string {
  const prefix = playerType === 'authenticated' ? 'auth' : 'guest';
  const safeActor = sanitizeRankingActorId(actorId);
  if (gameMode === 'daily') {
    return `${prefix}_${safeActor}_daily_${dateKey}`.slice(0, 128);
  }
  return `${prefix}_${safeActor}_standard`.slice(0, 128);
}

/**
 * Deterministically orders ranking entries: highest normalized score first,
 * then lowest average Haversine distance, then earliest update.
 */
export function sortUnifiedRankings(
  entries: readonly UnifiedRankingEntry[],
): readonly UnifiedRankingEntry[] {
  return [...entries].sort((a, b) => {
    if (b.bestScore !== a.bestScore) {
      return b.bestScore - a.bestScore;
    }
    if (a.averageDistanceKm !== b.averageDistanceKm) {
      return a.averageDistanceKm - b.averageDistanceKm;
    }
    return a.updatedAtIso.localeCompare(b.updatedAtIso);
  });
}

/**
 * Filters unified ranking entries by account type (`all` | `guest` | `authenticated`).
 */
export function filterUnifiedRankings(
  entries: readonly UnifiedRankingEntry[],
  filter: RankingPlayerFilter,
): readonly UnifiedRankingEntry[] {
  if (filter === 'all') {
    return entries;
  }
  return entries.filter((entry) => entry.playerType === filter);
}
