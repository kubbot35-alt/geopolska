import {z} from 'zod';
import {sanitizeRankingActorId} from '../../domain/rankings';

const GUEST_ID_STORAGE_KEY = 'geopolska_guest_client_id_v1';
const GUEST_NICKNAME_STORAGE_KEY = 'geopolska_guest_last_nickname_v1';

const OUTBOX_DB_NAME = 'geopolska_guest_rankings_outbox_db';
const OUTBOX_DB_VERSION = 1;
const OUTBOX_STORE = 'guest_rankings_outbox';

const QueuedGuestRankingSchema = z.object({
  queueKey: z.string().min(1).max(128),
  guestClientId: z.string().min(4).max(80),
  nickname: z.string().min(2).max(30),
  gameMode: z.enum(['standard', 'daily']),
  dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  totalScore: z.number().int().min(0).max(500000),
  roundsCount: z.union([
    z.literal(3),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(50),
    z.literal(100),
  ]),
  averageDistanceKm: z.number().min(0).max(25000),
  timedMode: z.boolean(),
  queuedAtIso: z.string(),
});

export type QueuedGuestRanking = z.infer<typeof QueuedGuestRankingSchema>;

let ephemeralGuestId: string | null = null;

function generateGuestId(): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 18)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return sanitizeRankingActorId(`g_${randomPart}`);
}

/**
 * Returns a stable browser-scoped guest identifier stored in localStorage,
 * ensuring separate records for standard mode vs Daily Challenge per browser.
 */
export function getOrCreateGuestClientId(): string {
  try {
    const existing = window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{4,80}$/.test(existing)) {
      return existing;
    }
    const created = generateGuestId();
    window.localStorage.setItem(GUEST_ID_STORAGE_KEY, created);
    return created;
  } catch {
    if (!ephemeralGuestId) {
      ephemeralGuestId = generateGuestId();
    }
    return ephemeralGuestId;
  }
}

export function readRememberedGuestNickname(): string {
  try {
    const raw = window.localStorage.getItem(GUEST_NICKNAME_STORAGE_KEY);
    return typeof raw === 'string' ? raw.trim().slice(0, 30) : '';
  } catch {
    return '';
  }
}

export function writeRememberedGuestNickname(nickname: string): void {
  try {
    const trimmed = nickname.trim().slice(0, 30);
    if (trimmed.length >= 2) {
      window.localStorage.setItem(GUEST_NICKNAME_STORAGE_KEY, trimmed);
    }
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

function openGuestOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, {keyPath: 'queueKey'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open guest outbox DB'));
  });
}

export async function enqueueOfflineGuestRanking(payload: QueuedGuestRanking): Promise<boolean> {
  const parsed = QueuedGuestRankingSchema.safeParse(payload);
  if (!parsed.success) {
    return false;
  }
  try {
    const db = await openGuestOutboxDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      tx.objectStore(OUTBOX_STORE).put(parsed.data);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

export async function listQueuedOfflineGuestRankings(): Promise<readonly QueuedGuestRanking[]> {
  try {
    const db = await openGuestOutboxDb();
    return await new Promise<readonly QueuedGuestRanking[]>((resolve) => {
      const tx = db.transaction(OUTBOX_STORE, 'readonly');
      const req = tx.objectStore(OUTBOX_STORE).getAll();
      req.onsuccess = () => {
        db.close();
        const rawList: unknown[] = Array.isArray(req.result) ? req.result : [];
        const valid: QueuedGuestRanking[] = [];
        for (const entry of rawList) {
          const parsed = QueuedGuestRankingSchema.safeParse(entry);
          if (parsed.success) {
            valid.push(parsed.data);
          }
        }
        resolve(valid);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    });
  } catch {
    return [];
  }
}

export async function removeQueuedOfflineGuestRanking(queueKey: string): Promise<void> {
  try {
    const db = await openGuestOutboxDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      tx.objectStore(OUTBOX_STORE).delete(queueKey);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Safe no-op when IndexedDB is unavailable
  }
}
