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
  clampCoordinatesForCatalog,
  normalizeCountryCode,
  normalizeLocationTags,
  validateCoordinatesForCatalog,
} from '../../domain/catalogSchema';
import {
  FEATURED_OFFLINE_LOCATIONS,
  POLAND_LOCATIONS,
  buildFreePhotoProxyUrl,
  slugifyLocationId,
  sortLocationsDeterministically,
} from '../../domain/polandLocations';
import type {
  CatalogReplaceProgress,
  CatalogReplaceSummary,
} from '../../domain/polandGeneratorTypes';
import type {
  CatalogKey,
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
const DEFAULT_CATALOG_KEY: CatalogKey = 'poland';
const MIGRATION_BATCH_SIZE = 350;

const FirestoreLocationDocSchema = z
  .object({
    id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
    catalogKey: z.enum(['poland', 'europe']),
    name: z.string().min(1).max(120),
    voivodeship: z.string().min(1).max(60),
    lat: z.number(),
    lng: z.number(),
    imageUrl: z.string().min(1).max(500),
    hint: z.string().min(1).max(500),
    funFact: z.string().min(1).max(600),
    regionCategory: z.enum(['miasto', 'gory', 'morze', 'zabytek', 'nad_woda']),
    isClassicOffline: z.boolean(),
    orderIndex: z.number().int().min(0).max(100000),
    countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    tags: z.array(z.string().min(1).max(32)).max(5).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((val) => validateCoordinatesForCatalog(val.catalogKey, val.lat, val.lng), {
    message: 'Coordinates outside catalog bounding box',
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
  const catalogKey: CatalogKey = input.catalogKey ?? DEFAULT_CATALOG_KEY;
  const cleanId = slugifyLocationId(input.id || input.name).slice(0, 128);
  const cleanName = input.name.trim().slice(0, 120);
  const cleanVoivodeship = input.voivodeship.trim().slice(0, 60);
  const {lat: cleanLat, lng: cleanLng} = clampCoordinatesForCatalog(
    catalogKey,
    input.lat,
    input.lng,
  );
  const rawImage = input.imageUrl.trim();
  const cleanImageUrl = (
    rawImage.length > 0
      ? rawImage
      : buildFreePhotoProxyUrl(cleanName, cleanVoivodeship, cleanLat, cleanLng)
  ).slice(0, 500);
  const cleanHint = input.hint.trim().slice(0, 500);
  const cleanFunFact = input.funFact.trim().slice(0, 600);
  const clampedOrderIndex = Math.max(0, Math.min(100000, Math.round(orderIndex)));
  const cleanCountryCode = normalizeCountryCode(input.countryCode, catalogKey);
  const cleanDifficulty = input.difficulty ?? 'medium';
  const cleanTags = [...normalizeLocationTags(input.tags)];
  const cleanIsActive = input.isActive !== false;

  return {
    id: cleanId,
    catalogKey,
    name: cleanName,
    voivodeship: cleanVoivodeship,
    lat: cleanLat,
    lng: cleanLng,
    imageUrl: cleanImageUrl,
    hint: cleanHint,
    funFact: cleanFunFact,
    regionCategory: input.regionCategory,
    isClassicOffline: catalogKey === 'poland' ? Boolean(input.isClassicOffline) : false,
    orderIndex: clampedOrderIndex,
    countryCode: cleanCountryCode,
    difficulty: cleanDifficulty,
    tags: cleanTags,
    isActive: cleanIsActive,
  };
}

async function readRemoteCatalogMeta(catalogKey: CatalogKey): Promise<CatalogMetaSnapshot | null> {
  const metaPath = `${CATALOG_META_COLLECTION}/${catalogKey}`;
  try {
    const snap = await getDoc(doc(db, CATALOG_META_COLLECTION, catalogKey));
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

async function fetchAllRemoteLocations(
  catalogKey: CatalogKey,
): Promise<readonly PolandLocation[]> {
  try {
    const q = query(
      collection(db, LOCATIONS_COLLECTION),
      where('catalogKey', '==', catalogKey),
    );
    const snapshot = await getDocs(q);
    const parsedLocations: PolandLocation[] = [];

    snapshot.forEach((docSnap) => {
      const parsed = FirestoreLocationDocSchema.safeParse(docSnap.data());
      if (parsed.success) {
        parsedLocations.push({
          id: parsed.data.id,
          catalogKey: parsed.data.catalogKey,
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
          countryCode: parsed.data.countryCode ?? (catalogKey === 'poland' ? 'PL' : 'FR'),
          difficulty: parsed.data.difficulty ?? 'medium',
          tags: parsed.data.tags ?? [],
          isActive: parsed.data.isActive ?? true,
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
  catalogKey: CatalogKey,
  actorUid: string,
  totalCount: number,
): Promise<CatalogMetaSnapshot> {
  const metaPath = `${CATALOG_META_COLLECTION}/${catalogKey}`;
  const metaRef = doc(db, CATALOG_META_COLLECTION, catalogKey);
  const clampedCount = Math.max(0, Math.min(100000, Math.round(totalCount)));

  try {
    const existingSnap = await getDoc(metaRef);
    if (!existingSnap.exists()) {
      const nextVersion = 1;
      await setDoc(metaRef, {
        id: catalogKey,
        version: nextVersion,
        totalCount: clampedCount,
        updatedBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        id: catalogKey,
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
      id: catalogKey,
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
  async fetchCatalogMeta(
    catalogKey: CatalogKey = DEFAULT_CATALOG_KEY,
  ): Promise<Result<CatalogMetaSnapshot | null, string>> {
    try {
      const meta = await readRemoteCatalogMeta(catalogKey);
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
    readonly catalogKey?: CatalogKey;
    readonly forceRefresh?: boolean;
    readonly signal?: AbortSignal;
  }): Promise<Result<LoadedLocationCatalog, string>> {
    const catalogKey: CatalogKey = options?.catalogKey ?? DEFAULT_CATALOG_KEY;
    const forceRefresh = options?.forceRefresh ?? false;
    const cached = await readCachedLocationsCatalog(catalogKey);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (cached && (cached.locations.length > 0 || catalogKey === 'europe')) {
        return {
          ok: true,
          value: {
            catalogKey,
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
          catalogKey,
          locations: catalogKey === 'poland' ? POLAND_LOCATIONS : [],
          source: 'seed_fallback',
          version: null,
          remoteCount: null,
          isSyncedWithCloud: false,
        },
      };
    }

    try {
      const remoteMeta = await readRemoteCatalogMeta(catalogKey);
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
              catalogKey,
              locations: sortLocationsDeterministically(cached.locations),
              source: 'indexeddb_cache',
              version: cached.version,
              remoteCount: remoteMeta.totalCount,
              isSyncedWithCloud: true,
            },
          };
        }

        const remoteLocations = await fetchAllRemoteLocations(catalogKey);
        if (options?.signal?.aborted) {
          return {ok: false, error: 'Przerwano ładowanie katalogu.'};
        }

        if (remoteLocations.length > 0) {
          await writeCachedLocationsCatalog(remoteMeta.version, remoteLocations, catalogKey);
          return {
            ok: true,
            value: {
              catalogKey,
              locations: remoteLocations,
              source: 'firestore',
              version: remoteMeta.version,
              remoteCount: remoteLocations.length,
              isSyncedWithCloud: true,
            },
          };
        }
      }

      if (catalogKey === 'europe') {
        return {
          ok: true,
          value: {
            catalogKey,
            locations: [],
            source: 'firestore',
            version: remoteMeta?.version ?? null,
            remoteCount: 0,
            isSyncedWithCloud: Boolean(remoteMeta),
          },
        };
      }

      // Remote Poland collection not yet populated — keep gameplay ready using bundled seed
      return {
        ok: true,
        value: {
          catalogKey,
          locations: POLAND_LOCATIONS,
          source: 'seed_fallback',
          version: remoteMeta?.version ?? null,
          remoteCount: 0,
          isSyncedWithCloud: false,
        },
      };
    } catch (error: unknown) {
      if (cached && (cached.locations.length > 0 || catalogKey === 'europe')) {
        return {
          ok: true,
          value: {
            catalogKey,
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
    catalogKey: CatalogKey = DEFAULT_CATALOG_KEY,
  ): Promise<Result<CatalogMetaSnapshot, string>> {
    if (seedLocations.length === 0) {
      return {ok: false, error: 'Brak lokacji do migracji.'};
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {ok: false, error: 'Migracja do Firebase wymaga aktywnego połączenia z internetem.'};
    }

    try {
      const existingRemote = await fetchAllRemoteLocations(catalogKey);
      if (signal?.aborted) {
        return {ok: false, error: 'Migracja została przerwana.'};
      }
      const existingById = new Map<string, PolandLocation>(
        existingRemote.map((loc) => [loc.id, loc]),
      );

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
          const existingLoc = existingById.get(rawLoc.id);
          const orderIndex =
            typeof rawLoc.orderIndex === 'number' ? rawLoc.orderIndex : start + offset;
          const sanitized = sanitizeLocationPayload(
            {
              id: rawLoc.id,
              catalogKey,
              name: rawLoc.name,
              voivodeship: rawLoc.voivodeship,
              lat: rawLoc.lat,
              lng: rawLoc.lng,
              imageUrl: rawLoc.imageUrl,
              hint: rawLoc.hint,
              funFact: rawLoc.funFact,
              regionCategory: rawLoc.regionCategory,
              isClassicOffline: Boolean(rawLoc.isClassicOffline),
              countryCode:
                existingLoc?.countryCode ?? rawLoc.countryCode ?? (catalogKey === 'poland' ? 'PL' : 'FR'),
              difficulty: existingLoc?.difficulty ?? rawLoc.difficulty ?? 'medium',
              tags: existingLoc?.tags ?? rawLoc.tags ?? [],
              isActive: existingLoc?.isActive ?? rawLoc.isActive ?? true,
            },
            orderIndex,
          );

          normalizedList.push({
            id: sanitized.id,
            catalogKey: sanitized.catalogKey,
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
            countryCode: sanitized.countryCode,
            difficulty: sanitized.difficulty,
            tags: sanitized.tags,
            isActive: sanitized.isActive,
          });

          const docRef = doc(db, LOCATIONS_COLLECTION, sanitized.id);
          if (existingById.has(sanitized.id)) {
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
              countryCode: sanitized.countryCode,
              difficulty: sanitized.difficulty,
              tags: sanitized.tags,
              isActive: sanitized.isActive,
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

      const meta = await bumpRemoteCatalogMeta(catalogKey, actorUid, mergedCatalog.length);
      await writeCachedLocationsCatalog(meta.version, mergedCatalog, catalogKey);

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
      return {ok: false, error: 'Uzupełnij nazwę, region/województwo, podpowiedź oraz ciekawostkę.'};
    }

    const catalogKey = sanitized.catalogKey;
    const docPath = `${LOCATIONS_COLLECTION}/${sanitized.id}`;
    const docRef = doc(db, LOCATIONS_COLLECTION, sanitized.id);

    try {
      const existingSnap = await getDoc(docRef);
      const isExisting = existingSnap.exists();
      if (isExisting && existingSnap.data().catalogKey !== catalogKey) {
        return {
          ok: false,
          error: `Lokacja o ID „${sanitized.id}” istnieje już w innym katalogu (${String(existingSnap.data().catalogKey)}). Użyj innej nazwy lub identyfikatora.`,
        };
      }

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
          countryCode: sanitized.countryCode,
          difficulty: sanitized.difficulty,
          tags: sanitized.tags,
          isActive: sanitized.isActive,
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
        catalogKey,
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
        countryCode: sanitized.countryCode,
        difficulty: sanitized.difficulty,
        tags: sanitized.tags,
        isActive: sanitized.isActive,
      };

      const cached = await readCachedLocationsCatalog(catalogKey);
      const baseList = cached?.locations ?? [];
      const nextList = sortLocationsDeterministically([
        ...baseList.filter((item) => item.id !== savedLocation.id),
        savedLocation,
      ]);

      const remoteMeta = await readRemoteCatalogMeta(catalogKey);
      const nextCount = isExisting
        ? Math.max(remoteMeta?.totalCount ?? nextList.length, nextList.length)
        : (remoteMeta?.totalCount ?? baseList.length) + 1;

      const updatedMeta = await bumpRemoteCatalogMeta(catalogKey, actorUid, nextCount);
      if (nextList.length === updatedMeta.totalCount) {
        await writeCachedLocationsCatalog(updatedMeta.version, nextList, catalogKey);
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

  async deleteLocation(
    locationId: string,
    actorUid: string,
    catalogKey: CatalogKey = DEFAULT_CATALOG_KEY,
  ): Promise<Result<void, string>> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {ok: false, error: 'Usuwanie lokacji wymaga połączenia z internetem.'};
    }
    const docPath = `${LOCATIONS_COLLECTION}/${locationId}`;
    const docRef = doc(db, LOCATIONS_COLLECTION, locationId);

    try {
      await deleteDoc(docRef);
      const cached = await readCachedLocationsCatalog(catalogKey);
      const nextList = (cached?.locations ?? []).filter((item) => item.id !== locationId);
      const remoteMeta = await readRemoteCatalogMeta(catalogKey);
      const nextCount = Math.max(0, (remoteMeta?.totalCount ?? nextList.length + 1) - 1);
      const updatedMeta = await bumpRemoteCatalogMeta(catalogKey, actorUid, nextCount);
      if (nextList.length === updatedMeta.totalCount) {
        await writeCachedLocationsCatalog(updatedMeta.version, nextList, catalogKey);
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

  async replacePolandOnlineCatalog(
    generatedLocations: readonly PolandLocation[],
    actorUid: string,
    onProgress?: (progress: CatalogReplaceProgress) => void,
    signal?: AbortSignal,
  ): Promise<Result<CatalogReplaceSummary, string>> {
    if (generatedLocations.length === 0) {
      return {ok: false, error: 'Brak wygenerowanych lokalizacji do zapisania.'};
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {ok: false, error: 'Zastąpienie bazy w Firebase wymaga połączenia z internetem.'};
    }

    try {
      onProgress?.({phase: 'reading', processed: 0, total: 1});
      const existingRemote = await fetchAllRemoteLocations('poland');
      if (signal?.aborted) {
        return {ok: false, error: 'Operacja została przerwana.'};
      }
      const existingById = new Map<string, PolandLocation>(
        existingRemote.map((loc) => [loc.id, loc]),
      );

      const classicIdSet = new Set<string>(FEATURED_OFFLINE_LOCATIONS.map((loc) => loc.id));
      const classicNameSet = new Set<string>(
        FEATURED_OFFLINE_LOCATIONS.map((loc) => loc.name.trim().toLowerCase()),
      );

      const classicEntries = FEATURED_OFFLINE_LOCATIONS.map((loc, idx) =>
        sanitizeLocationPayload(
          {
            id: loc.id,
            catalogKey: 'poland',
            name: loc.name,
            voivodeship: loc.voivodeship,
            lat: loc.lat,
            lng: loc.lng,
            imageUrl: loc.imageUrl,
            hint: loc.hint,
            funFact: loc.funFact,
            regionCategory: loc.regionCategory,
            isClassicOffline: true,
            countryCode: 'PL',
            difficulty: 'easy',
            tags: [],
            isActive: true,
          },
          idx,
        ),
      );

      const dedupedOnline: ReturnType<typeof sanitizeLocationPayload>[] = [];
      const seenOnlineIds = new Set<string>();
      const seenOnlineNames = new Set<string>();
      for (const rawLoc of generatedLocations) {
        const cleanNameKey = rawLoc.name.trim().toLowerCase();
        if (classicIdSet.has(rawLoc.id) || classicNameSet.has(cleanNameKey)) {
          continue;
        }
        const sanitized = sanitizeLocationPayload(
          {
            id: rawLoc.id,
            catalogKey: 'poland',
            name: rawLoc.name,
            voivodeship: rawLoc.voivodeship,
            lat: rawLoc.lat,
            lng: rawLoc.lng,
            imageUrl: rawLoc.imageUrl,
            hint: rawLoc.hint,
            funFact: rawLoc.funFact,
            regionCategory: rawLoc.regionCategory,
            isClassicOffline: false,
            countryCode: 'PL',
            difficulty: rawLoc.difficulty ?? 'medium',
            tags: rawLoc.tags ?? [],
            isActive: rawLoc.isActive !== false,
          },
          classicEntries.length + dedupedOnline.length,
        );
        if (
          classicIdSet.has(sanitized.id) ||
          seenOnlineIds.has(sanitized.id) ||
          seenOnlineNames.has(cleanNameKey)
        ) {
          continue;
        }
        seenOnlineIds.add(sanitized.id);
        seenOnlineNames.add(cleanNameKey);
        dedupedOnline.push(sanitized);
      }

      const recordsToWrite = [...classicEntries, ...dedupedOnline];
      const keepIdSet = new Set<string>(recordsToWrite.map((item) => item.id));
      const staleIdsToDelete = existingRemote
        .map((loc) => loc.id)
        .filter((id) => !keepIdSet.has(id));

      onProgress?.({phase: 'writing', processed: 0, total: recordsToWrite.length});
      let written = 0;
      for (let start = 0; start < recordsToWrite.length; start += MIGRATION_BATCH_SIZE) {
        if (signal?.aborted) {
          return {ok: false, error: 'Zapis został przerwany w trakcie wysyłania partii.'};
        }
        const chunk = recordsToWrite.slice(start, start + MIGRATION_BATCH_SIZE);
        const batch = writeBatch(db);
        for (const item of chunk) {
          const docRef = doc(db, LOCATIONS_COLLECTION, item.id);
          if (existingById.has(item.id)) {
            batch.update(docRef, {
              name: item.name,
              voivodeship: item.voivodeship,
              lat: item.lat,
              lng: item.lng,
              imageUrl: item.imageUrl,
              hint: item.hint,
              funFact: item.funFact,
              regionCategory: item.regionCategory,
              isClassicOffline: item.isClassicOffline,
              orderIndex: item.orderIndex,
              countryCode: item.countryCode,
              difficulty: item.difficulty,
              tags: item.tags,
              isActive: item.isActive,
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(docRef, {
              ...item,
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
        written += chunk.length;
        onProgress?.({phase: 'writing', processed: written, total: recordsToWrite.length});
      }

      let deleted = 0;
      if (staleIdsToDelete.length > 0) {
        onProgress?.({phase: 'deleting', processed: 0, total: staleIdsToDelete.length});
        for (let start = 0; start < staleIdsToDelete.length; start += MIGRATION_BATCH_SIZE) {
          if (signal?.aborted) {
            return {ok: false, error: 'Usuwanie starych lokalizacji zostało przerwane.'};
          }
          const chunk = staleIdsToDelete.slice(start, start + MIGRATION_BATCH_SIZE);
          const batch = writeBatch(db);
          for (const staleId of chunk) {
            batch.delete(doc(db, LOCATIONS_COLLECTION, staleId));
          }
          try {
            await batch.commit();
          } catch (deleteError: unknown) {
            if (isPermissionError(deleteError)) {
              handleFirestoreError(deleteError, OperationType.DELETE, LOCATIONS_COLLECTION);
            }
            throw deleteError;
          }
          deleted += chunk.length;
          onProgress?.({phase: 'deleting', processed: deleted, total: staleIdsToDelete.length});
        }
      }

      onProgress?.({phase: 'meta', processed: 0, total: 1});
      const finalCatalog: PolandLocation[] = sortLocationsDeterministically(
        recordsToWrite.map((item) => ({
          id: item.id,
          catalogKey: item.catalogKey,
          name: item.name,
          voivodeship: item.voivodeship,
          lat: item.lat,
          lng: item.lng,
          imageUrl: item.imageUrl,
          hint: item.hint,
          funFact: item.funFact,
          regionCategory: item.regionCategory,
          isClassicOffline: item.isClassicOffline,
          orderIndex: item.orderIndex,
          countryCode: item.countryCode,
          difficulty: item.difficulty,
          tags: item.tags,
          isActive: item.isActive,
        })),
      ) as PolandLocation[];

      const meta = await bumpRemoteCatalogMeta('poland', actorUid, finalCatalog.length);
      await writeCachedLocationsCatalog(meta.version, finalCatalog, 'poland');
      onProgress?.({phase: 'meta', processed: 1, total: 1});

      return {
        ok: true,
        value: {
          meta,
          classicPreserved: classicEntries.length,
          writtenCount: dedupedOnline.length,
          deletedCount: deleted,
          totalCount: finalCatalog.length,
        },
      };
    } catch (error: unknown) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Nie udało się zastąpić katalogu Polski w Firebase Firestore.',
      };
    }
  }
}

export const locationRepository = new FirestoreLocationRepository();
