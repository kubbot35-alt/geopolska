import type {PolandLocation} from './types';

export const DAILY_CHALLENGE_ROUNDS = 5 as const;

const WARSAW_TIMEZONE = 'Europe/Warsaw';

/**
 * Computes today's canonical Polish calendar date key (`YYYY-MM-DD`) in `Europe/Warsaw` timezone.
 */
export function getWarsawDateKey(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: WARSAW_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback to UTC ISO date if Intl timeZone is unavailable
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Formats a `YYYY-MM-DD` key into a readable Polish date string (e.g. "20 listopada 2026").
 */
export function formatPolishDateKey(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return dateKey;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month, day)));
  } catch {
    return dateKey;
  }
}

/**
 * Deterministic 32-bit FNV-1a hash used to seed the daily challenge PRNG.
 */
function hashDateKeyToSeed(dateKey: string): number {
  let hash = 2166136261;
  const salted = `GeoPolska::Daily::${dateKey}`;
  for (let i = 0; i < salted.length; i += 1) {
    hash ^= salted.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic mulberry32 PRNG producing floats in [0, 1).
 */
function createSeededPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically selects `count` unique Polish locations for a given `YYYY-MM-DD` date key.
 * Every player worldwide gets the exact same sequence on the same Warsaw calendar day.
 */
export function drawDailyChallengeDeck(
  pool: readonly PolandLocation[],
  dateKey: string,
  count: number = DAILY_CHALLENGE_ROUNDS,
): readonly PolandLocation[] {
  const activePool = pool.filter((loc) => loc.isActive !== false);
  const source = activePool.length > 0 ? activePool : pool;
  if (source.length === 0) {
    return [];
  }
  const copy = [...source];
  const prng = createSeededPrng(hashDateKeyToSeed(dateKey));

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(prng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }

  return copy.slice(0, Math.min(count, copy.length));
}
