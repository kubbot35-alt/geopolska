import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {z} from 'zod';
import {
  POLAND_LOCATIONS,
  buildFreePhotoProxyUrl,
  slugifyLocationId,
  sortLocationsDeterministically,
} from '../../domain/polandLocations';
import type {
  CatalogMetaSnapshot,
  ILocationCatalogRepository,
  LoadedLocationCatalog,
  LocationUpsertInput,
  PolandLocation,
  Result,
} from '../../domain/types';
import {
  readCachedLocationsCatalog,
  writeCachedLocationsCatalog,
} from '../storage/locationsLocalCache';
import {OperationType, db, handleFirestoreError} from './firebaseClient';

const LOCATIONS_COLLECTION = 'locations';
const CATALOG_META_COLLECTION = 'catalogMeta';
const CATALOG_KEY = 'poland';
const MIGRATION_BATCH_SIZE = 350;

const FirestoreLocationDocSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  catalogKey: z.literal(CATALOG_KEY),
  name: z.string().min(1).max(120),
  voivodeship: z.string().min(1).max(60),
  lat: z.number().min(48.5).max(55.5),
  lng: z.number().min(13.5).max(25.0),
  imageUrl: z.string().min(1).max(500),
  hint: z.string().min(1).max(500),
  funFact: z.string().min(1).max(600),
  regionCategory: z.enum(['miasto', 'gory', 'morze', 'zabytek', 'nad_woda']),
  isClassicOffline: z.boolean(),
  orderIndex: z.number().int().min(0).max(100000),
});

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

function isOfflineNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('offline') || msg.includes('unavailable') || msg.includes('network');
}

function isPermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('permission') || msg.includes('insufficient');
}

function sanitizeLocationPayload(input: LocationUpsertInput, orderIndex: number) {
  const cleanId = slugifyLocationId(input.id || input.name).slice(0, 128);
  const cleanName = input.name.trim().slice(0, 120);
  const cleanVoivodeship = input.voivodeship.trim().slice(0, 60);
  const cleanLat = Math.max(48.5, Math.min(55.5, Number(input.lat.toFixed(5))));
  const cleanLng = Math.max(13.5, Math.min(25.0, Number(input.lng.toFixed(5))));
  const rawImage = input.imageUrl.trim();
  const cleanImageUrl = (
    rawImage.length > 0
      ? rawImage
      : buildFreePhotoProxyUrl(cleanName, cleanVoivodeship, cleanLat, cleanLng)
  ).slice(0, 500);
  const cleanHint = input.hint.trim().slice(0, 500);
  const cleanFunFact = input.funFact.trim().slice(0, 600);
  const clampedOrderIndex = Math.max(0, Math.min(100000, Math.round(orderIndex)));

  return {
    id: cleanId,
    catalogKey: CATALOG_KEY as typeof CATALOG_KEY,
    name: cleanName,
    voivodeship: cleanVoivodeship,
    lat: cleanLat,
    lng: cleanLng,
    imageUrl: cleanImageUrl,
    hint: cleanHint,
    funFact: cleanFunFact,
    regionCategory: input.regionCategory,
    isClassicOffline: Boolean(input.isClassicOffline),
    orderIndex: clampedOrderIndex,
  };
}

async function readRemoteCatalogMeta(): Promise<CatalogMetaSnapshot | null> {
  const metaPath = `${CATALOG_META_COLLECTION}/${CATALOG_KEY}`;
  try {
    const snap = await getDoc(doc(db, CATALOG_META_COLLECTION, CATALOG_KEY));
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data();
    const version = typeof data.version === 'number' && data.version >= 1 ? Math.round(data.version) : 1;
    const totalCount =
      typeof data.totalCount === 'number' && data.totalCount >= 0 ? Math.round(data.totalCount) : 0;
    const updatedBy = typeof data.updatedBy === 'string' ? data.updatedBy : '';
    return {
      id: snap.id,
      version,
      totalCount,
      updatedBy,
      updatedAtIso: timestampToIso(data.updatedAt),
    };
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, metaPath);
  }
}

async function fetchAllRemoteLocations(): Promise<readonly PolandLocation[]> {
  try {
    const q = query(
      collection(db, LOCATIONS_COLLECTION),
      where('catalogKey', '==', CATALOG_KEY),
    );
    const snapshot = await getDocs(q);
    const parsedLocations: PolandLocation[] = [];

    snapshot.forEach((docSnap) => {
      const parsed = FirestoreLocationDocSchema.safeParse(docSnap.data());
      if (parsed.success) {
        parsedLocations.push({
          id: parsed.data.id,
          name: parsed.data.name,
          voivodeship: parsed.data.voivodeship,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          imageUrl: parsed.data.imageUrl,
          hint: parsed.data.hint,
          funFact: parsed.data.funFact,
          regionCategory: parsed.data.regionCategory,
          isClassicOffline: parsed.data.isClassicOffline,
          orderIndex: parsed.data.orderIndex,
        });
      }
    });

    return sortLocationsDeterministically(parsedLocations);
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.LIST, LOCATIONS_COLLECTION);
  }
}

async function bumpRemoteCatalogMeta(
  actorUid: string,
  totalCount: number,
): Promise<CatalogMetaSnapshot> {
  const metaPath = `${CATALOG_META_COLLECTION}/${CATALOG_KEY}`;
  const metaRef = doc(db, CATALOG_META_COLLECTION, CATALOG_KEY);
  const clampedCount = Math.max(0, Math.min(100000, Math.round(totalCount)));

  try {
    const existingSnap = await getDoc(metaRef);
    if (!existingSnap.exists()) {
      const nextVersion = 1;
      await setDoc(metaRef, {
        id: CATALOG_KEY,
        version: nextVersion,
        totalCount: clampedCount,
        updatedBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        id: CATALOG_KEY,
        version: nextVersion,
        totalCount: clampedCount,
        updatedBy: actorUid,
        updatedAtIso: new Date().toISOString(),
      };
    }

    const prevData = existingSnap.data();
    const prevVersion = typeof prevData.version === 'number' ? Math.round(prevData.version) : 1;
    const nextVersion = Math.min(1000000, prevVersion + 1);

    await updateDoc(metaRef, {
      version: nextVersion,
      totalCount: clampedCount,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });

    return {
      id: CATALOG_KEY,
      version: nextVersion,
      totalCount: clampedCount,
      updatedBy: actorUid,
      updatedAtIso: new Date().toISOString(),
    };
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, metaPath);
  }
}

export class FirestoreLocationRepository implements ILocationCatalogRepository {
  async fetchCatalogMeta(): Promise<Result<CatalogMetaSnapshot | null, string>> {
    try {
      const meta = await readRemoteCatalogMeta();
      return {ok: true, value: meta};
    } catch (error: unknown) {
      if (isOfflineNetworkError(error)) {
        return {ok: false, error: 'Tryb offline — brak połączenia z bazą Firebase.'};
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Nie udało się odczytać metadanych katalogu.',
      };
    }
  }

  async loadCatalog(options?: {
    readonly forceRefresh?: boolean;
    readonly signal?: AbortSignal;
  }): Promise<Result<LoadedLocationCatalog, string>> {
    const forceRefresh = options?.forceRefresh ?? false;
    const cached = await readCachedLocationsCatalog();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (cached && cached.locations.length > 0) {
        return {
          ok: true,
          value: {
            locations: sortLocationsDeterministically(cached.locations),
            source: 'indexeddb_cache',
            version: cached.version,
            remoteCount: cached.locations.length,
            isSyncedWithCloud: true,
          },
        };
      }
      return {
        ok: true,
        value: {
          locations: POLAND_LOCATIONS,
          source: 'seed_fallback',
          version: null,
          remoteCount: null,
          isSyncedWithCloud: false,
        },
      };
    }

    try {
      const remoteMeta = await readRemoteCatalogMeta();
      if (options?.signal?.aborted) {
        return {ok: false, error: 'Przerwano ładowanie katalogu.'};
      }

      if (remoteMeta && remoteMeta.totalCount > 0) {
        const cacheMatchesRemote =
          !forceRefresh &&
          cached !== null &&
          cached.version === remoteMeta.version &&
          cached.locations.length === remoteMeta.totalCount;

        if (cacheMatchesRemote) {
          return {
            ok: true,
            value: {
              locations: sortLocationsDeterministically(cached.locations),
              source: 'indexeddb_cache',
              version: cached.version,
              remoteCount: remoteMeta.totalCount,
              isSyncedWithCloud: true,
            },
          };
        }

        const remoteLocations = await fetchAllRemoteLocations();
        if (options?.signal?.aborted) {
          return {ok: false, error: 'Przerwano ładowanie katalogu.'};
        }

        if (remoteLocations.length > 0) {
          await writeCachedLocationsCatalog(remoteMeta.version, remoteLocations);
          return {
            ok: true,
            value: {
              locations: remoteLocations,
              source: 'firestore',
              version: remoteMeta.version,
              remoteCount: remoteLocations.length,
              isSyncedWithCloud: true,
            },
          };
        }
      }

      // Remote collection not yet populated — keep gameplay ready using bundled seed
      return {
        ok: true,
        value: {
          locations: POLAND_LOCATIONS,
          source: 'seed_fallback',
          version: remoteMeta?.version ?? null,
          remoteCount: 0,
          isSyncedWithCloud: false,
        },
      };
    } catch (error: unknown) {
      if (cached && cached.locations.length > 0) {
        return {
          ok: true,
          value: {
            locations: sortLocationsDeterministically(cached.locations),
            source: 'indexeddb_cache',
            version: cached.version,
            remoteCount: cached.locations.length,
            isSyncedWithCloud: true,
          },
        };
      }
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Nie udało się załadować katalogu lokacji z Firebase.',
      };
    }
  }

  async migrateSeedLocations(
    seedLocations: readonly PolandLocation[],
    actorUid: string,
    onProgress?: (processed: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<Result<CatalogMetaSnapshot, string>> {
    if (seedLocations.length === 0) {
      return {ok: false, error: 'Brak lokacji do migracji.'};
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {ok: false, error: 'Migracja do Firebase wymaga aktywnego połączenia z internetem.'};
    }

    try {
      const existingRemote = await fetchAllRemoteLocations();
      if (signal?.aborted) {
        return {ok: false, error: 'Migracja została przerwana.'};
      }
      const existingIds = new Set<string>(existingRemote.map((loc) => loc.id));

      const normalizedList: PolandLocation[] = [];
      let processed = 0;
      const total = seedLocations.length;
      onProgress?.(0, total);

      for (let start = 0; start < total; start += MIGRATION_BATCH_SIZE) {
        if (signal?.aborted) {
          return {ok: false, error: 'Migracja została przerwana w trakcie zapisu.'};
        }

        const chunk = seedLocations.slice(start, start + MIGRATION_BATCH_SIZE);
        const batch = writeBatch(db);

        for (let offset = 0; offset < chunk.length; offset += 1) {
          const rawLoc = chunk[offset];
          const orderIndex =
            typeof rawLoc.orderIndex === 'number' ? rawLoc.orderIndex : start + offset;
          const sanitized = sanitizeLocationPayload(
            {
              id: rawLoc.id,
              name: rawLoc.name,
              voivodeship: rawLoc.voivodeship,
              lat: rawLoc.lat,
              lng: rawLoc.lng,
              imageUrl: rawLoc.imageUrl,
              hint: rawLoc.hint,
              funFact: rawLoc.funFact,
              regionCategory: rawLoc.regionCategory,
              isClassicOffline: Boolean(rawLoc.isClassicOffline),
            },
            orderIndex,
          );

          normalizedList.push({
            id: sanitized.id,
            name: sanitized.name,
            voivodeship: sanitized.voivodeship,
            lat: sanitized.lat,
            lng: sanitized.lng,
            imageUrl: sanitized.imageUrl,
            hint: sanitized.hint,
            funFact: sanitized.funFact,
            regionCategory: sanitized.regionCategory,
            isClassicOffline: sanitized.isClassicOffline,
            orderIndex: sanitized.orderIndex,
          });

          const docRef = doc(db, LOCATIONS_COLLECTION, sanitized.id);
          if (existingIds.has(sanitized.id)) {
            batch.update(docRef, {
              name: sanitized.name,
              voivodeship: sanitized.voivodeship,
              lat: sanitized.lat,
              lng: sanitized.lng,
              imageUrl: sanitized.imageUrl,
              hint: sanitized.hint,
              funFact: sanitized.funFact,
              regionCategory: sanitized.regionCategory,
              isClassicOffline: sanitized.isClassicOffline,
              orderIndex: sanitized.orderIndex,
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(docRef, {
              ...sanitized,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }

        try {
          await batch.commit();
        } catch (batchError: unknown) {
          if (isPermissionError(batchError)) {
            handleFirestoreError(batchError, OperationType.WRITE, LOCATIONS_COLLECTION);
          }
          throw batchError;
        }

        processed += chunk.length;
        onProgress?.(processed, total);
      }

      // Preserve any additional custom locations that already existed in Firestore outside seed
      const seedIdSet = new Set<string>(normalizedList.map((loc) => loc.id));
      const extraCustomLocations = existingRemote.filter((loc) => !seedIdSet.has(loc.id));
      const mergedCatalog = sortLocationsDeterministically([
        ...normalizedList,
        ...extraCustomLocations,
      ]);

      const meta = await bumpRemoteCatalogMeta(actorUid, mergedCatalog.length);
      await writeCachedLocationsCatalog(meta.version, mergedCatalog);

      return {ok: true, value: meta};
    } catch (error: unknown) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Nie udało się przenieść lokacji do Firebase Firestore.',
      };
    }
  }

  async upsertLocation(
    input: LocationUpsertInput,
    actorUid: string,
    nextOrderIndex: number,
  ): Promise<Result<PolandLocation, string>> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {ok: false, error: 'Edycja bazy lokacji wymaga połączenia z internetem.'};
    }

    const sanitized = sanitizeLocationPayload(input, nextOrderIndex);
    if (!sanitized.name || !sanitized.voivodeship || !sanitized.hint || !sanitized.funFact) {
      return {ok: false, error: 'Uzupełnij nazwę, województwo, podpowiedź oraz ciekawostkę.'};
    }

    const docPath = `${LOCATIONS_COLLECTION}/${sanitized.id}`;
    const docRef = doc(db, LOCATIONS_COLLECTION, sanitized.id);

    try {
      const existingSnap = await getDoc(docRef);
      const isExisting = existingSnap.exists();
      const preservedOrderIndex =
        isExisting && typeof existingSnap.data().orderIndex === 'number'
          ? Math.round(existingSnap.data().orderIndex)
          : sanitized.orderIndex;

      if (isExisting) {
        await updateDoc(docRef, {
          name: sanitized.name,
          voivodeship: sanitized.voivodeship,
          lat: sanitized.lat,
          lng: sanitized.lng,
          imageUrl: sanitized.imageUrl,
          hint: sanitized.hint,
          funFact: sanitized.funFact,
          regionCategory: sanitized.regionCategory,
          isClassicOffline: sanitized.isClassicOffline,
          orderIndex: preservedOrderIndex,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          ...sanitized,
          orderIndex: preservedOrderIndex,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const savedLocation: PolandLocation = {
        id: sanitized.id,
        name: sanitized.name,
        voivodeship: sanitized.voivodeship,
        lat: sanitized.lat,
        lng: sanitized.lng,
        imageUrl: sanitized.imageUrl,
        hint: sanitized.hint,
        funFact: sanitized.funFact,
        regionCategory: sanitized.regionCategory,
        isClassicOffline: sanitized.isClassicOffline,
        orderIndex: preservedOrderIndex,
      };

      const cached = await readCachedLocationsCatalog();
      const baseList = cached?.locations ?? [];
      const nextList = sortLocationsDeterministically([
        ...baseList.filter((item) => item.id !== savedLocation.id),
        savedLocation,
      ]);

      const remoteMeta = await readRemoteCatalogMeta();
      const nextCount = isExisting
        ? Math.max(remoteMeta?.totalCount ?? nextList.length, nextList.length)
        : (remoteMeta?.totalCount ?? baseList.length) + 1;

      const updatedMeta = await bumpRemoteCatalogMeta(actorUid, nextCount);
      if (nextList.length === updatedMeta.totalCount) {
        await writeCachedLocationsCatalog(updatedMeta.version, nextList);
      }

      return {ok: true, value: savedLocation};
    } catch (error: unknown) {
      if (isPermissionError(error)) {
        handleFirestoreError(error, OperationType.WRITE, docPath);
      }
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Nie udało się zapisać lokacji w Firebase.',
      };
    }
  }

  async deleteLocation(locationId: string, actorUid: string): Promise<Result<void, string>> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {ok: false, error: 'Usuwanie lokacji wymaga połączenia z internetem.'};
    }
    const docPath = `${LOCATIONS_COLLECTION}/${locationId}`;
    const docRef = doc(db, LOCATIONS_COLLECTION, locationId);

    try {
      await deleteDoc(docRef);
      const cached = await readCachedLocationsCatalog();
      const nextList = (cached?.locations ?? []).filter((item) => item.id !== locationId);
      const remoteMeta = await readRemoteCatalogMeta();
      const nextCount = Math.max(0, (remoteMeta?.totalCount ?? nextList.length + 1) - 1);
      const updatedMeta = await bumpRemoteCatalogMeta(actorUid, nextCount);
      if (nextList.length === updatedMeta.totalCount && nextList.length > 0) {
        await writeCachedLocationsCatalog(updatedMeta.version, nextList);
      }
      return {ok: true, value: undefined};
    } catch (error: unknown) {
      if (isPermissionError(error)) {
        handleFirestoreError(error, OperationType.DELETE, docPath);
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Nie udało się usunąć lokacji z Firebase.',
      };
    }
  }
}

export const locationRepository = new FirestoreLocationRepository();
