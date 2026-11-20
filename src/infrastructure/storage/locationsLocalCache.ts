import {z} from 'zod';
import type {PolandLocation} from '../../domain/types';

const DB_NAME = 'geopolska_locations_cache_db';
const DB_VERSION = 1;
const STORE_SNAPSHOT = 'catalog_snapshot';
const SNAPSHOT_KEY = 'poland';

const CachedLocationSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(120),
  voivodeship: z.string().min(1).max(60),
  lat: z.number().min(48.5).max(55.5),
  lng: z.number().min(13.5).max(25.0),
  imageUrl: z.string().min(1).max(500),
  hint: z.string().min(1).max(500),
  funFact: z.string().min(1).max(600),
  regionCategory: z.enum(['miasto', 'gory', 'morze', 'zabytek', 'nad_woda']),
  isClassicOffline: z.boolean().optional(),
  orderIndex: z.number().int().min(0).max(100000).optional(),
});

const CachedCatalogSnapshotSchema = z.object({
  key: z.literal(SNAPSHOT_KEY),
  version: z.number().int().min(1),
  updatedAtIso: z.string(),
  locations: z.array(CachedLocationSchema),
});

export interface CachedLocationsSnapshot {
  readonly version: number;
  readonly updatedAtIso: string;
  readonly locations: readonly PolandLocation[];
}

function openLocationsCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) {
        db.createObjectStore(STORE_SNAPSHOT, {keyPath: 'key'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open locations cache DB'));
  });
}

/**
 * Reads the validated Firestore location catalog snapshot from IndexedDB.
 * Returns null if storage is empty, corrupted, or unavailable.
 */
export async function readCachedLocationsCatalog(): Promise<CachedLocationsSnapshot | null> {
  try {
    const db = await openLocationsCacheDb();
    return await new Promise<CachedLocationsSnapshot | null>((resolve) => {
      const tx = db.transaction(STORE_SNAPSHOT, 'readonly');
      const req = tx.objectStore(STORE_SNAPSHOT).get(SNAPSHOT_KEY);
      req.onsuccess = () => {
        db.close();
        const parsed = CachedCatalogSnapshotSchema.safeParse(req.result);
        if (!parsed.success || parsed.data.locations.length === 0) {
          resolve(null);
          return;
        }
        resolve({
          version: parsed.data.version,
          updatedAtIso: parsed.data.updatedAtIso,
          locations: parsed.data.locations,
        });
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Persists a validated Firestore location catalog snapshot to IndexedDB for offline-first boot
 * and zero-cost subsequent loads when the remote catalog version has not changed.
 */
export async function writeCachedLocationsCatalog(
  version: number,
  locations: readonly PolandLocation[],
): Promise<boolean> {
  const payload = {
    key: SNAPSHOT_KEY,
    version,
    updatedAtIso: new Date().toISOString(),
    locations,
  };
  const parsed = CachedCatalogSnapshotSchema.safeParse(payload);
  if (!parsed.success) {
    return false;
  }
  try {
    const db = await openLocationsCacheDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_SNAPSHOT, 'readwrite');
      tx.objectStore(STORE_SNAPSHOT).put(parsed.data);
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

export async function clearCachedLocationsCatalog(): Promise<void> {
  try {
    const db = await openLocationsCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_SNAPSHOT, 'readwrite');
      tx.objectStore(STORE_SNAPSHOT).delete(SNAPSHOT_KEY);
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
