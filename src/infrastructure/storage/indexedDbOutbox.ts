import {z} from 'zod';

const DB_NAME = 'geopolska_offline_db';
const DB_VERSION = 1;
const STORE_OUTBOX = 'game_outbox';

const QueuedGamePayloadSchema = z
  .object({
    id: z.string().min(1).max(128),
    uid: z.string().min(1).max(128),
    playerName: z.string().min(1).max(60),
    photoUrl: z.string().max(500),
    totalScore: z.number().int().min(0).max(500000),
    averageDistanceKm: z.number().min(0).max(25000),
    timedMode: z.boolean(),
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
    roundLocations: z.array(z.string().max(80)).min(3).max(100),
    roundScores: z.array(z.number().int().min(0).max(5000)).min(3).max(100),
    roundDistances: z.array(z.number().min(0)).min(3).max(100),
    dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    queuedAtIso: z.string(),
  })
  .refine(
    (d) =>
      d.roundLocations.length === d.roundsCount &&
      d.roundScores.length === d.roundsCount &&
      d.roundDistances.length === d.roundsCount &&
      d.totalScore <= d.roundsCount * 5000,
    {message: 'Nieprawidłowa liczba rund lub przekroczony limit punktów.'},
  );

export type QueuedGamePayload = z.infer<typeof QueuedGamePayloadSchema>;

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, {keyPath: 'id'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function enqueueOfflineGame(payload: QueuedGamePayload): Promise<boolean> {
  const validated = QueuedGamePayloadSchema.safeParse(payload);
  if (!validated.success) {
    return false;
  }
  try {
    const db = await openOfflineDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).put(validated.data);
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

export async function listQueuedOfflineGames(uid: string): Promise<readonly QueuedGamePayload[]> {
  try {
    const db = await openOfflineDb();
    return await new Promise<readonly QueuedGamePayload[]>((resolve) => {
      const tx = db.transaction(STORE_OUTBOX, 'readonly');
      const req = tx.objectStore(STORE_OUTBOX).getAll();
      req.onsuccess = () => {
        db.close();
        const rawList: unknown[] = Array.isArray(req.result) ? req.result : [];
        const valid: QueuedGamePayload[] = [];
        for (const entry of rawList) {
          const parsed = QueuedGamePayloadSchema.safeParse(entry);
          if (parsed.success && parsed.data.uid === uid) {
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

export async function removeQueuedOfflineGame(id: string): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).delete(id);
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
    // Storage unavailable; safe no-op
  }
}
