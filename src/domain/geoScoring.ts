import type {GeoCoordinate, HintLevel, ScoreBreakdown} from './types';

const EARTH_RADIUS_KM = 6371.0088;

export const MAX_ROUND_POINTS = 5000;
export const MAX_GAME_POINTS = 25000;
export const PERFECT_DISTANCE_KM = 5;
export const ZERO_POINTS_DISTANCE_KM = 350;
export const POLAND_DECAY_SCALE_KM = 82;

export const HINT_1_PENALTY = 500;
export const HINT_2_ADDITIONAL_PENALTY = 1000;
export const HINT_2_TOTAL_PENALTY = HINT_1_PENALTY + HINT_2_ADDITIONAL_PENALTY;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates great-circle distance in kilometers between two WGS84 coordinates using the Haversine formula.
 */
export function calculateHaversineDistanceKm(a: GeoCoordinate, b: GeoCoordinate): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const clamped = Math.min(1, Math.max(0, h));

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clamped));
}

/**
 * Computes raw Poland-calibrated score (0..5000):
 * - < 5 km -> 5000 pts
 * - >= 350 km -> 0 pts
 * - 5..350 km -> smooth exponential decay normalized so it reaches 0 cleanly at 350 km.
 */
export function calculatePolandBaseScore(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return 0;
  }
  if (distanceKm < PERFECT_DISTANCE_KM) {
    return MAX_ROUND_POINTS;
  }
  if (distanceKm >= ZERO_POINTS_DISTANCE_KM) {
    return 0;
  }

  const shifted = distanceKm - PERFECT_DISTANCE_KM;
  const maxRange = ZERO_POINTS_DISTANCE_KM - PERFECT_DISTANCE_KM;
  const rawExp = Math.exp(-shifted / POLAND_DECAY_SCALE_KM);
  const minExp = Math.exp(-maxRange / POLAND_DECAY_SCALE_KM);
  const normalized = (rawExp - minExp) / (1 - minExp);

  return Math.max(0, Math.min(MAX_ROUND_POINTS, Math.round(MAX_ROUND_POINTS * normalized)));
}

/**
 * Returns total maximum-score reduction for the active hint level:
 * - Level 0: 0 pts
 * - Level 1 (Voivodeship): -500 pts
 * - Level 2 (Clue + First letter): -1500 pts total (-500 + -1000)
 */
export function getHintPenaltyPoints(hintLevel: HintLevel): number {
  if (hintLevel === 1) {
    return HINT_1_PENALTY;
  }
  if (hintLevel === 2) {
    return HINT_2_TOTAL_PENALTY;
  }
  return 0;
}

/**
 * Combines Haversine distance score with active hint penalties, capping the round score at (5000 - hintPenalty).
 */
export function calculateFinalRoundScore(
  distanceKm: number | null,
  hintLevel: HintLevel,
): ScoreBreakdown {
  const hintPenalty = getHintPenaltyPoints(hintLevel);
  const maxPossibleScore = Math.max(0, MAX_ROUND_POINTS - hintPenalty);

  if (distanceKm === null) {
    return {
      baseScore: 0,
      hintPenalty,
      maxPossibleScore,
      finalScore: 0,
    };
  }

  const baseScore = calculatePolandBaseScore(distanceKm);
  const finalScore = Math.min(maxPossibleScore, Math.max(0, baseScore - hintPenalty));

  return {
    baseScore,
    hintPenalty,
    maxPossibleScore,
    finalScore,
  };
}

/**
 * Formats distance cleanly for Polish telemetry readouts.
 */
export function formatDistanceKm(distanceKm: number): string {
  if (!Number.isFinite(distanceKm)) {
    return '—';
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1).replace('.', ',')} km`;
  }
  return `${Math.round(distanceKm)} km`;
}

/**
 * Computes average distance across completed rounds that have valid distances.
 */
export function calculateAverageDistanceKm(distances: readonly number[]): number {
  if (distances.length === 0) {
    return 0;
  }
  const sum = distances.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / distances.length) * 10) / 10;
}

/**
 * Returns maximum achievable total score for a match of `roundsCount` rounds.
 */
export function calculateMaxGamePoints(roundsCount: number): number {
  if (!Number.isFinite(roundsCount) || roundsCount <= 0) {
    return MAX_GAME_POINTS;
  }
  return Math.round(roundsCount) * MAX_ROUND_POINTS;
}

/**
 * Normalizes a variable-length match score onto the standard 5-round leaderboard scale (0..25000).
 */
export function normalizeScoreToStandard5Rounds(totalScore: number, roundsCount: number): number {
  if (!Number.isFinite(totalScore) || !Number.isFinite(roundsCount) || roundsCount <= 0) {
    return 0;
  }
  const normalized = Math.round((totalScore / roundsCount) * 5);
  return Math.max(0, Math.min(MAX_GAME_POINTS, normalized));
}
