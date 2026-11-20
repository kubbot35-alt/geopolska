import {z} from 'zod';
import type {LocalDailyCompletion} from '../../domain/types';

const STORAGE_KEY_PREFIX = 'geopolska_daily_done_v1_';

const LocalDailyCompletionSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  score: z.number().int().min(0).max(25000),
  averageDistanceKm: z.number().min(0).max(25000),
  completedAtIso: z.string(),
});

export function readLocalDailyCompletion(dateKey: string): LocalDailyCompletion | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${dateKey}`);
    if (!raw) {
      return null;
    }
    const parsed = LocalDailyCompletionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeLocalDailyCompletion(entry: LocalDailyCompletion): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const validated = LocalDailyCompletionSchema.safeParse(entry);
    if (!validated.success) {
      return;
    }
    const existing = readLocalDailyCompletion(entry.dateKey);
    if (existing) {
      // Preserve the official first daily attempt locally
      return;
    }
    window.localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${entry.dateKey}`,
      JSON.stringify(validated.data),
    );
  } catch {
    // Ignore quota or storage restrictions
  }
}
