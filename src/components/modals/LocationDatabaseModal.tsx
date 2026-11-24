import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  CheckCircle2,
  CloudUpload,
  Database,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  LogIn,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import {
  CATALOG_DEFINITIONS,
  CATALOG_KEYS,
  DIFFICULTY_LABELS,
  EUROPEAN_COUNTRIES,
  LOCATION_DIFFICULTIES,
  getCountryNameByCode,
  normalizeCountryCode,
  normalizeLocationTags,
  validateCoordinatesForCatalog,
} from '../../domain/catalogSchema';
import {
  POLAND_LOCATIONS,
  POLISH_VOIVODESHIPS,
  slugifyLocationId,
} from '../../domain/polandLocations';
import type {
  CatalogKey,
  ILocationCatalogRepository,
  LocationCatalogState,
  LocationDifficulty,
  LocationUpsertInput,
  PlayerIdentity,
  PolandLocation,
  RegionCategory,
} from '../../domain/types';
import {LocationSchemaPanel} from './LocationSchemaPanel';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'jakub.j.linert@gmail.com';

export interface LocationDatabaseModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLock: () => void;
  readonly repository: ILocationCatalogRepository;
  readonly locations: readonly PolandLocation[];
  readonly catalogState: LocationCatalogState;
  readonly player: PlayerIdentity | null;
  readonly isOnline: boolean;
  readonly onSignIn: () => void;
  readonly onRefreshCatalog: (forceRefresh: boolean) => Promise<void>;
  readonly onCatalogMutated: () => Promise<void>;
}

type ModalViewTab = 'locations' | 'schema';
type StatusFilter = 'all' | 'active' | 'inactive';

const CATEGORY_LABELS: Readonly<Record<RegionCategory, string>> = {
  miasto: 'Miasto',
  zabytek: 'Zamek / zabytek',
  gory: 'Góry',
  morze: 'Morze',
  nad_woda: 'Jeziora / rzeki',
};

const CATEGORIES: readonly RegionCategory[] = ['miasto', 'zabytek', 'gory', 'morze', 'nad_woda'];

interface LocationFormState {
  readonly editingId: string | null;
  readonly name: string;
  readonly countryCode: string;
  readonly voivodeship: string;
  readonly lat: string;
  readonly lng: string;
  readonly imageUrl: string;
  readonly hint: string;
  readonly funFact: string;
  readonly regionCategory: RegionCategory;
  readonly difficulty: LocationDifficulty;
  readonly tagsInput: string;
  readonly isClassicOffline: boolean;
  readonly isActive: boolean;
}

function createEmptyForm(catalogKey: CatalogKey): LocationFormState {
  const def = CATALOG_DEFINITIONS[catalogKey];
  return {
    editingId: null,
    name: '',
    countryCode: def.defaultCountryCode,
    voivodeship: catalogKey === 'poland' ? 'Mazowieckie' : '',
    lat: String(def.defaultLat),
    lng: String(def.defaultLng),
    imageUrl: '',
    hint: '',
    funFact: '',
    regionCategory: 'miasto',
    difficulty: 'medium',
    tagsInput: '',
    isClassicOffline: false,
    isActive: true,
  };
}

function formatCatalogSourceLabel(state: LocationCatalogState, catalogKey: CatalogKey): string {
  if (state.status === 'loading') {
    return `Łączenie z Firebase Firestore (${CATALOG_DEFINITIONS[catalogKey].label})...`;
  }
  if (state.status === 'error') {
    return state.message;
  }
  if (state.source === 'firestore') {
    return 'Firebase Firestore (świeży odczyt z chmury)';
  }
  if (state.source === 'indexeddb_cache') {
    return 'Firebase Firestore (zsynchronizowany cache IndexedDB)';
  }
  return 'Katalog startowy JSON (oczekuje na przeniesienie do Firebase)';
}

export const LocationDatabaseModal: React.FC<LocationDatabaseModalProps> = ({
  open,
  onClose,
  onLock,
  repository,
  locations,
  catalogState,
  player,
  isOnline,
  onSignIn,
  onRefreshCatalog,
  onCatalogMutated,
}) => {
  const [activeCatalog, setActiveCatalog] = useState<CatalogKey>('poland');
  const [activeView, setActiveView] = useState<ModalViewTab>('locations');

  const [europeLocations, setEuropeLocations] = useState<readonly PolandLocation[]>([]);
  const [europeState, setEuropeState] = useState<LocationCatalogState>({
    status: 'loading',
    catalogKey: 'europe',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RegionCategory | 'all'>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<LocationDifficulty | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visibleLimit, setVisibleLimit] = useState(40);

  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{
    readonly processed: number;
    readonly total: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly tone: 'success' | 'error';
    readonly text: string;
  } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LocationFormState>(() => createEmptyForm('poland'));
  const [savingForm, setSavingForm] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const migrationAbortRef = useRef<AbortController | null>(null);
  const europeLoadAbortRef = useRef<AbortController | null>(null);

  const isAdmin = Boolean(
    player &&
      player.emailVerified &&
      player.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase(),
  );

  const loadEuropeCatalog = useCallback(
    async (forceRefresh = false) => {
      europeLoadAbortRef.current?.abort();
      const controller = new AbortController();
      europeLoadAbortRef.current = controller;

      setEuropeState({status: 'loading', catalogKey: 'europe'});
      const res = await repository.loadCatalog({
        catalogKey: 'europe',
        forceRefresh,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (res.ok) {
        setEuropeLocations(res.value.locations);
        setEuropeState({
          status: 'ready',
          catalogKey: 'europe',
          source: res.value.source,
          version: res.value.version,
          totalCount: res.value.locations.length,
          remoteCount: res.value.remoteCount,
          isSyncedWithCloud: res.value.isSyncedWithCloud,
        });
      } else {
        setEuropeState({
          status: 'error',
          catalogKey: 'europe',
          message: res.error,
          source: 'firestore',
          totalCount: europeLocations.length,
        });
      }
    },
    [repository, europeLocations.length],
  );

  useEffect(() => {
    if (!open) {
      migrationAbortRef.current?.abort();
      europeLoadAbortRef.current?.abort();
      setConfirmDeleteId(null);
    }
    return () => {
      migrationAbortRef.current?.abort();
      europeLoadAbortRef.current?.abort();
    };
  }, [open]);

  useEffect(() => {
    if (open && activeCatalog === 'europe') {
      void loadEuropeCatalog(false);
    }
  }, [open, activeCatalog, isOnline, loadEuropeCatalog]);

  const currentCatalogDef = CATALOG_DEFINITIONS[activeCatalog];
  const currentLocations = activeCatalog === 'poland' ? locations : europeLocations;
  const currentCatalogState = activeCatalog === 'poland' ? catalogState : europeState;

  const activeCountInPool = useMemo(
    () => currentLocations.filter((loc) => loc.isActive !== false).length,
    [currentLocations],
  );

  const filteredLocations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return currentLocations.filter((loc) => {
      if (categoryFilter !== 'all' && loc.regionCategory !== categoryFilter) {
        return false;
      }
      const locDifficulty: LocationDifficulty = loc.difficulty ?? 'medium';
      if (difficultyFilter !== 'all' && locDifficulty !== difficultyFilter) {
        return false;
      }
      const locActive = loc.isActive !== false;
      if (statusFilter === 'active' && !locActive) {
        return false;
      }
      if (statusFilter === 'inactive' && locActive) {
        return false;
      }
      if (!q) {
        return true;
      }
      const countryName = getCountryNameByCode(loc.countryCode).toLowerCase();
      const tagMatch = (loc.tags ?? []).some((tag) => tag.toLowerCase().includes(q));
      return (
        loc.name.toLowerCase().includes(q) ||
        loc.voivodeship.toLowerCase().includes(q) ||
        loc.id.toLowerCase().includes(q) ||
        (loc.countryCode ?? '').toLowerCase().includes(q) ||
        countryName.includes(q) ||
        tagMatch
      );
    });
  }, [currentLocations, searchQuery, categoryFilter, difficultyFilter, statusFilter]);

  if (!open) {
    return null;
  }

  const remoteCount =
    currentCatalogState.status === 'ready' ? currentCatalogState.remoteCount : null;
  const catalogVersion =
    currentCatalogState.status === 'ready' ? currentCatalogState.version : null;
  const isCloudPopulated =
    currentCatalogState.status === 'ready' && currentCatalogState.isSyncedWithCloud;

  const handleSelectCatalog = (nextKey: CatalogKey) => {
    if (nextKey === activeCatalog) {
      return;
    }
    setActiveCatalog(nextKey);
    setFormOpen(false);
    setForm(createEmptyForm(nextKey));
    setSearchQuery('');
    setCategoryFilter('all');
    setDifficultyFilter('all');
    setStatusFilter('all');
    setVisibleLimit(40);
    setConfirmDeleteId(null);
    setFeedback(null);
  };

  const refreshActiveCatalog = async (forceRefresh: boolean) => {
    if (activeCatalog === 'poland') {
      await onRefreshCatalog(forceRefresh);
    } else {
      await loadEuropeCatalog(forceRefresh);
    }
  };

  const notifyActiveCatalogMutated = async () => {
    if (activeCatalog === 'poland') {
      await onCatalogMutated();
    } else {
      await loadEuropeCatalog(true);
    }
  };

  const handleMigrateSeed = async () => {
    if (!player || !isAdmin || !isOnline || migrating || activeCatalog !== 'poland') {
      return;
    }
    migrationAbortRef.current?.abort();
    const controller = new AbortController();
    migrationAbortRef.current = controller;

    setMigrating(true);
    setFeedback(null);
    setMigrationProgress({processed: 0, total: POLAND_LOCATIONS.length});

    const result = await repository.migrateSeedLocations(
      POLAND_LOCATIONS,
      player.uid,
      (processed, total) => {
        setMigrationProgress({processed, total});
      },
      controller.signal,
      'poland',
    );

    if (controller.signal.aborted) {
      setMigrating(false);
      return;
    }

    setMigrating(false);
    if (!result.ok) {
      setFeedback({tone: 'error', text: result.error});
      return;
    }

    await onCatalogMutated();
    setFeedback({
      tone: 'success',
      text: `Zsynchronizowano ${result.value.totalCount.toLocaleString('pl-PL')} lokacji Polski w Firebase Firestore (wersja manifestu v${result.value.version}).`,
    });
  };

  const handleForceRefresh = async () => {
    if (!isOnline || refreshing) {
      return;
    }
    setRefreshing(true);
    setFeedback(null);
    await refreshActiveCatalog(true);
    setRefreshing(false);
    setFeedback({
      tone: 'success',
      text: `Odświeżono katalog „${currentCatalogDef.label}” z Firebase Firestore.`,
    });
  };

  const handleStartCreate = () => {
    setActiveView('locations');
    setForm(createEmptyForm(activeCatalog));
    setFormOpen(true);
    setFeedback(null);
  };

  const handleStartEdit = (loc: PolandLocation) => {
    setForm({
      editingId: loc.id,
      name: loc.name,
      countryCode: loc.countryCode ?? currentCatalogDef.defaultCountryCode,
      voivodeship: loc.voivodeship,
      lat: String(loc.lat),
      lng: String(loc.lng),
      imageUrl: loc.imageUrl,
      hint: loc.hint,
      funFact: loc.funFact,
      regionCategory: loc.regionCategory,
      difficulty: loc.difficulty ?? 'medium',
      tagsInput: (loc.tags ?? []).join(', '),
      isClassicOffline: Boolean(loc.isClassicOffline),
      isActive: loc.isActive !== false,
    });
    setFormOpen(true);
    setFeedback(null);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player || !isAdmin || !isOnline || savingForm) {
      return;
    }

    const parsedLat = Number(form.lat.replace(',', '.'));
    const parsedLng = Number(form.lng.replace(',', '.'));
    if (!validateCoordinatesForCatalog(activeCatalog, parsedLat, parsedLng)) {
      setFeedback({
        tone: 'error',
        text: `Współrzędne muszą leżeć w granicach katalogu ${currentCatalogDef.label} (lat: ${currentCatalogDef.latMin}–${currentCatalogDef.latMax}, lng: ${currentCatalogDef.lngMin}–${currentCatalogDef.lngMax}).`,
      });
      return;
    }

    const parsedTags = normalizeLocationTags(form.tagsInput);
    const normalizedCountry = normalizeCountryCode(form.countryCode, activeCatalog);

    const input: LocationUpsertInput = {
      id: form.editingId ?? slugifyLocationId(form.name),
      catalogKey: activeCatalog,
      name: form.name,
      voivodeship: form.voivodeship,
      lat: parsedLat,
      lng: parsedLng,
      imageUrl: form.imageUrl,
      hint: form.hint,
      funFact: form.funFact,
      regionCategory: form.regionCategory,
      isClassicOffline: activeCatalog === 'poland' ? form.isClassicOffline : false,
      countryCode: normalizedCountry,
      difficulty: form.difficulty,
      tags: parsedTags,
      isActive: form.isActive,
    };

    const maxOrder = currentLocations.reduce(
      (acc, loc) => (typeof loc.orderIndex === 'number' && loc.orderIndex > acc ? loc.orderIndex : acc),
      currentLocations.length,
    );

    setSavingForm(true);
    setFeedback(null);

    const res = await repository.upsertLocation(input, player.uid, maxOrder + 1);
    setSavingForm(false);

    if (!res.ok) {
      setFeedback({tone: 'error', text: res.error});
      return;
    }

    await notifyActiveCatalogMutated();
    setFormOpen(false);
    setForm(createEmptyForm(activeCatalog));
    setFeedback({
      tone: 'success',
      text: form.editingId
        ? `Zaktualizowano lokację „${res.value.name}” (${currentCatalogDef.label}) w Firebase Firestore.`
        : `Dodano lokację „${res.value.name}” do katalogu ${currentCatalogDef.label} w Firebase Firestore.`,
    });
  };

  const handleToggleActive = async (loc: PolandLocation) => {
    if (!player || !isAdmin || !isOnline || togglingId) {
      return;
    }
    const nextActive = loc.isActive === false;
    setTogglingId(loc.id);
    setFeedback(null);

    const input: LocationUpsertInput = {
      id: loc.id,
      catalogKey: activeCatalog,
      name: loc.name,
      voivodeship: loc.voivodeship,
      lat: loc.lat,
      lng: loc.lng,
      imageUrl: loc.imageUrl,
      hint: loc.hint,
      funFact: loc.funFact,
      regionCategory: loc.regionCategory,
      isClassicOffline: Boolean(loc.isClassicOffline),
      countryCode: normalizeCountryCode(loc.countryCode, activeCatalog),
      difficulty: loc.difficulty ?? 'medium',
      tags: loc.tags ?? [],
      isActive: nextActive,
    };

    const res = await repository.upsertLocation(
      input,
      player.uid,
      typeof loc.orderIndex === 'number' ? loc.orderIndex : currentLocations.length,
    );
    setTogglingId(null);

    if (!res.ok) {
      setFeedback({tone: 'error', text: res.error});
      return;
    }

    await notifyActiveCatalogMutated();
    setFeedback({
      tone: 'success',
      text: nextActive
        ? `Przywrócono lokację „${loc.name}” do puli losowań.`
        : `Wyłączono lokację „${loc.name}” z puli losowań (dokument zachowany w bazie).`,
    });
  };

  const handleConfirmDelete = async (locationId: string) => {
    if (!player || !isAdmin || !isOnline || deletingId) {
      return;
    }
    setDeletingId(locationId);
    setFeedback(null);
    const res = await repository.deleteLocation(locationId, player.uid, activeCatalog);
    setDeletingId(null);
    setConfirmDeleteId(null);

    if (!res.ok) {
      setFeedback({tone: 'error', text: res.error});
      return;
    }

    await notifyActiveCatalogMutated();
    setFeedback({tone: 'success', text: 'Usunięto lokację z Firebase Firestore.'});
  };

  const progressPercent =
    migrationProgress && migrationProgress.total > 0
      ? Math.round((migrationProgress.processed / migrationProgress.total) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Baza lokacji Firebase"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101822] text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Baza Lokacji Firebase Firestore
              </h2>
              <p className="text-xs text-slate-400">
                {formatCatalogSourceLabel(currentCatalogState, activeCatalog)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Catalog Switcher: Polska / Europa */}
            <div
              role="group"
              aria-label="Wybór katalogu regionalnego"
              className="inline-flex items-center rounded-lg border border-white/10 bg-[#0C131D] p-1"
            >
              {CATALOG_KEYS.map((key) => {
                const isSelected = activeCatalog === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectCatalog(key)}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-emerald-500 text-[#05120D]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {key === 'europe' && <Globe className="h-3.5 w-3.5 shrink-0" />}
                    {CATALOG_DEFINITIONS[key].label}
                  </button>
                );
              })}
            </div>

            {/* View Switcher: Lista / Schemat */}
            <div
              role="group"
              aria-label="Widok panelu bazy"
              className="inline-flex items-center rounded-lg border border-white/10 bg-[#0C131D] p-1"
            >
              <button
                type="button"
                onClick={() => setActiveView('locations')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  activeView === 'locations'
                    ? 'bg-white/12 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Lista lokacji
              </button>
              <button
                type="button"
                onClick={() => setActiveView('schema')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  activeView === 'schema'
                    ? 'bg-white/12 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Table2 className="h-3.5 w-3.5 shrink-0" />
                Schemat tabel
              </button>
            </div>

            <button
              type="button"
              onClick={onLock}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:border-amber-400/60 hover:bg-amber-500/20 hover:text-amber-100 whitespace-nowrap shrink-0"
              title="Zablokuj dostęp do Bazy Lokacji kodem"
            >
              <Lock className="h-3.5 w-3.5" />
              Zablokuj
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij bazę lokacji"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
              <WifiOff className="h-4 w-4 shrink-0" />
              Tryb offline — aplikacja korzysta z lokalnej kopii IndexedDB dla katalogu{' '}
              {currentCatalogDef.label}. Migracja i edycja wymagają sieci.
            </div>
          )}

          {activeView === 'schema' ? (
            <LocationSchemaPanel />
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-[#0C131D] p-3.5">
                  <p className="text-xs font-medium text-slate-400">
                    Aktywne w puli ({currentCatalogDef.label})
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {activeCountInPool.toLocaleString('pl-PL')}
                    {activeCountInPool !== currentLocations.length && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        / {currentLocations.length.toLocaleString('pl-PL')} łącznie
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0C131D] p-3.5">
                  <p className="text-xs font-medium text-slate-400">
                    W Firebase (/locations · {activeCatalog})
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                    {remoteCount !== null ? remoteCount.toLocaleString('pl-PL') : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0C131D] p-3.5">
                  <p className="text-xs font-medium text-slate-400">
                    Wersja manifestu (/catalogMeta/{activeCatalog})
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-200 tabular-nums">
                    {catalogVersion !== null ? `v${catalogVersion}` : 'Nieutworzona'}
                  </p>
                </div>
              </div>

              {/* Admin Actions & Migration Controls */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-[#0C131D] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Zarządzanie katalogiem: {currentCatalogDef.label}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {currentCatalogDef.subtitle} · Granice WGS84: lat {currentCatalogDef.latMin}–
                      {currentCatalogDef.latMax}, lng {currentCatalogDef.lngMin}–
                      {currentCatalogDef.lngMax}.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleForceRefresh()}
                      disabled={!isOnline || refreshing || migrating}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#101822] px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      Odśwież z Firebase
                    </button>

                    {isAdmin && (
                      <>
                        {currentCatalogDef.hasBundledSeed && (
                          <button
                            type="button"
                            onClick={() => void handleMigrateSeed()}
                            disabled={!isOnline || migrating}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            {migrating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CloudUpload className="h-3.5 w-3.5" />
                            )}
                            {isCloudPopulated
                              ? `Zsynchronizuj ${POLAND_LOCATIONS.length.toLocaleString('pl-PL')} lokacji`
                              : `Przenieś ${POLAND_LOCATIONS.length.toLocaleString('pl-PL')} lokacji do Firebase`}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleStartCreate}
                          disabled={!isOnline || migrating}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Dodaj lokację
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!player && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-950/30 p-3">
                    <p className="text-xs text-emerald-100">
                      Zaloguj się na konto administratora ({BOOTSTRAPPED_ADMIN_EMAIL}), aby zarządzać
                      katalogami Polska i Europa w Firebase Firestore.
                    </p>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      Zaloguj Google
                    </button>
                  </div>
                )}

                {player && !isAdmin && (
                  <p className="rounded-lg border border-white/10 bg-[#101822] p-3 text-xs text-slate-400">
                    Jesteś zalogowany jako{' '}
                    <span className="text-slate-200">{player.email || player.displayName}</span>.
                    Zapis i migracja katalogu w Firestore są chronione uprawnieniami administratora.
                  </p>
                )}

                {migrating && migrationProgress && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs text-emerald-200 tabular-nums">
                      <span>Zapisywanie partii dokumentów w Firestore...</span>
                      <span>
                        {migrationProgress.processed.toLocaleString('pl-PL')} /{' '}
                        {migrationProgress.total.toLocaleString('pl-PL')} ({progressPercent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{width: `${progressPercent}%`}}
                      />
                    </div>
                  </div>
                )}

                {feedback && (
                  <div
                    className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                      feedback.tone === 'success'
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                        : 'border-rose-500/35 bg-rose-950/40 text-rose-200'
                    }`}
                  >
                    {feedback.tone === 'success' && (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    )}
                    <span className="break-words">{feedback.text}</span>
                  </div>
                )}
              </div>

              {/* Admin Add / Edit Form */}
              {formOpen && isAdmin && (
                <form
                  onSubmit={(e) => void handleSaveForm(e)}
                  className="space-y-3.5 rounded-xl border border-emerald-500/30 bg-[#0C131D] p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-white">
                      {form.editingId
                        ? `Edycja lokacji (${form.editingId} · ${currentCatalogDef.label})`
                        : `Nowa lokacja w katalogu ${currentCatalogDef.label}`}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setFormOpen(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Anuluj
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-400">
                        Nazwa miejsca
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({...prev, name: e.target.value}))}
                        placeholder={
                          activeCatalog === 'poland'
                            ? 'np. Zamek w Ogrodzieńcu'
                            : 'np. Mont-Saint-Michel'
                        }
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        Kod kraju (ISO-2)
                      </label>
                      {activeCatalog === 'poland' ? (
                        <input
                          type="text"
                          readOnly
                          value="PL — Polska"
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822]/60 px-3 font-mono text-xs text-slate-400 focus:outline-none"
                        />
                      ) : (
                        <select
                          value={form.countryCode}
                          onChange={(e) =>
                            setForm((prev) => ({...prev, countryCode: e.target.value}))
                          }
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        >
                          {EUROPEAN_COUNTRIES.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.code} — {country.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        {currentCatalogDef.regionFieldLabel}
                      </label>
                      {activeCatalog === 'poland' ? (
                        <select
                          value={form.voivodeship}
                          onChange={(e) =>
                            setForm((prev) => ({...prev, voivodeship: e.target.value}))
                          }
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        >
                          {POLISH_VOIVODESHIPS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          required
                          maxLength={60}
                          value={form.voivodeship}
                          onChange={(e) =>
                            setForm((prev) => ({...prev, voivodeship: e.target.value}))
                          }
                          placeholder={currentCatalogDef.regionPlaceholder}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400">Kategoria</label>
                      <select
                        value={form.regionCategory}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            regionCategory: e.target.value as RegionCategory,
                          }))
                        }
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {CATEGORY_LABELS[cat]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        Poziom trudności
                      </label>
                      <select
                        value={form.difficulty}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            difficulty: e.target.value as LocationDifficulty,
                          }))
                        }
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      >
                        {LOCATION_DIFFICULTIES.map((diff) => (
                          <option key={diff} value={diff}>
                            {DIFFICULTY_LABELS[diff]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        Szerokość (lat {currentCatalogDef.latMin}–{currentCatalogDef.latMax})
                      </label>
                      <input
                        type="text"
                        required
                        value={form.lat}
                        onChange={(e) => setForm((prev) => ({...prev, lat: e.target.value}))}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 font-mono text-xs text-white tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        Długość (lng {currentCatalogDef.lngMin}–{currentCatalogDef.lngMax})
                      </label>
                      <input
                        type="text"
                        required
                        value={form.lng}
                        onChange={(e) => setForm((prev) => ({...prev, lng: e.target.value}))}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 font-mono text-xs text-white tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        URL zdjęcia (puste = auto proxy Wikipedia/Wikimedia)
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        value={form.imageUrl}
                        onChange={(e) => setForm((prev) => ({...prev, imageUrl: e.target.value}))}
                        placeholder="opcjonalny link HTTPS"
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        Tagi tematyczne (oddzielone przecinkiem, maks. 5)
                      </label>
                      <input
                        type="text"
                        value={form.tagsInput}
                        onChange={(e) => setForm((prev) => ({...prev, tagsInput: e.target.value}))}
                        placeholder="np. UNESCO, gotyk, port"
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        Podpowiedź (bez nazwy miejsca)
                      </label>
                      <textarea
                        rows={2}
                        required
                        maxLength={500}
                        value={form.hint}
                        onChange={(e) => setForm((prev) => ({...prev, hint: e.target.value}))}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#101822] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400">
                        Ciekawostka po rundzie
                      </label>
                      <textarea
                        rows={2}
                        required
                        maxLength={600}
                        value={form.funFact}
                        onChange={(e) => setForm((prev) => ({...prev, funFact: e.target.value}))}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#101822] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-5">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={(e) =>
                            setForm((prev) => ({...prev, isActive: e.target.checked}))
                          }
                          className="h-4 w-4 rounded border-white/20 bg-[#101822] accent-emerald-500"
                        />
                        Aktywna w puli losowań
                      </label>

                      {activeCatalog === 'poland' && (
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={form.isClassicOffline}
                            onChange={(e) =>
                              setForm((prev) => ({...prev, isClassicOffline: e.target.checked}))
                            }
                            className="h-4 w-4 rounded border-white/20 bg-[#101822] accent-emerald-500"
                          />
                          Pula „Klasyczna 20 (offline)”
                        </label>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={savingForm}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {savingForm && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {form.editingId ? 'Zapisz zmiany w Firebase' : 'Dodaj do Firebase'}
                    </button>
                  </div>
                </form>
              )}

              {/* Search, Filters & Location List */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[210px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setVisibleLimit(40);
                      }}
                      placeholder="Szukaj po nazwie, regionie, kraju, tagu lub ID..."
                      className="min-h-[40px] w-full rounded-lg border border-white/10 bg-[#0C131D] pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value as RegionCategory | 'all');
                      setVisibleLimit(40);
                    }}
                    className="min-h-[40px] rounded-lg border border-white/10 bg-[#0C131D] px-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="all">Kategorie ({currentLocations.length})</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>

                  <select
                    value={difficultyFilter}
                    onChange={(e) => {
                      setDifficultyFilter(e.target.value as LocationDifficulty | 'all');
                      setVisibleLimit(40);
                    }}
                    className="min-h-[40px] rounded-lg border border-white/10 bg-[#0C131D] px-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="all">Wszystkie trudności</option>
                    {LOCATION_DIFFICULTIES.map((diff) => (
                      <option key={diff} value={diff}>
                        {DIFFICULTY_LABELS[diff]}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as StatusFilter);
                      setVisibleLimit(40);
                    }}
                    className="min-h-[40px] rounded-lg border border-white/10 bg-[#0C131D] px-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="all">Status: wszystkie</option>
                    <option value="active">Tylko aktywne</option>
                    <option value="inactive">Tylko wyłączone</option>
                  </select>
                </div>

                <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-[#0C131D]">
                  {currentCatalogState.status === 'loading' && currentLocations.length === 0 ? (
                    <div className="divide-y divide-white/5">
                      {[0, 1, 2, 3].map((idx) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-3">
                          <div className="space-y-1.5">
                            <div className="h-3.5 w-48 animate-pulse rounded bg-white/10" />
                            <div className="h-3 w-72 animate-pulse rounded bg-white/5" />
                          </div>
                          <div className="h-7 w-20 animate-pulse rounded bg-white/5" />
                        </div>
                      ))}
                    </div>
                  ) : filteredLocations.length > 0 ? (
                    filteredLocations.slice(0, visibleLimit).map((loc) => {
                      const isLocActive = loc.isActive !== false;
                      const locDiff: LocationDifficulty = loc.difficulty ?? 'medium';
                      const locCountry = loc.countryCode ?? currentCatalogDef.defaultCountryCode;
                      const locTags = loc.tags ?? [];

                      return (
                        <div
                          key={loc.id}
                          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-white/[0.02] ${
                            isLocActive ? '' : 'opacity-60'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-semibold text-white">{loc.name}</span>
                              <span className="text-slate-400">
                                {loc.voivodeship} ({locCountry})
                              </span>
                              <span aria-hidden="true" className="text-slate-600">
                                ·
                              </span>
                              <span className="text-emerald-400">
                                {CATEGORY_LABELS[loc.regionCategory]}
                              </span>
                              <span aria-hidden="true" className="text-slate-600">
                                ·
                              </span>
                              <span className="text-slate-300">{DIFFICULTY_LABELS[locDiff]}</span>
                              {!isLocActive && (
                                <>
                                  <span aria-hidden="true" className="text-slate-600">
                                    ·
                                  </span>
                                  <span className="font-semibold text-amber-300">Wyłączona</span>
                                </>
                              )}
                              {locTags.length > 0 && (
                                <>
                                  <span aria-hidden="true" className="text-slate-600">
                                    ·
                                  </span>
                                  <span className="text-slate-400">{locTags.join(' / ')}</span>
                                </>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-slate-400">
                              <span className="font-mono text-slate-500 tabular-nums">
                                {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                              </span>{' '}
                              · {loc.hint}
                            </p>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={togglingId === loc.id || !isOnline}
                                onClick={() => void handleToggleActive(loc)}
                                aria-label={
                                  isLocActive
                                    ? `Wyłącz ${loc.name} z puli`
                                    : `Aktywuj ${loc.name} w puli`
                                }
                                title={
                                  isLocActive
                                    ? 'Wyłącz z losowań (bez usuwania)'
                                    : 'Przywróć do losowań'
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-300 transition-colors hover:border-amber-500/40 hover:text-amber-200 disabled:opacity-50"
                              >
                                {togglingId === loc.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : isLocActive ? (
                                  <Eye className="h-3.5 w-3.5" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleStartEdit(loc)}
                                aria-label={`Edytuj ${loc.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-white"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>

                              {confirmDeleteId === loc.id ? (
                                <button
                                  type="button"
                                  disabled={deletingId === loc.id}
                                  onClick={() => void handleConfirmDelete(loc.id)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md bg-rose-600 px-2.5 text-[11px] font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                                >
                                  {deletingId === loc.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    'Usuń?'
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(loc.id)}
                                  aria-label={`Usuń ${loc.name}`}
                                  className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-200">
                        {currentLocations.length === 0 && activeCatalog === 'europe'
                          ? 'Katalog Europa jest jeszcze pusty'
                          : 'Brak lokacji pasujących do wybranych filtrów'}
                      </p>
                      <p className="max-w-md text-xs text-slate-400">
                        {currentLocations.length === 0 && activeCatalog === 'europe'
                          ? 'Baza Firestore i reguły bezpieczeństwa są już gotowe na lokacje europejskie (catalogKey: europe). Dodaj pierwsze miejsce, aby utworzyć manifest /catalogMeta/europe.'
                          : 'Zmień kryteria wyszukiwania, poziom trudności lub status aktywności.'}
                      </p>
                      {currentLocations.length === 0 && activeCatalog === 'europe' && isAdmin && (
                        <button
                          type="button"
                          onClick={handleStartCreate}
                          disabled={!isOnline}
                          className="mt-1 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Dodaj pierwszą lokację Europy
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {filteredLocations.length > visibleLimit && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((prev) => prev + 60)}
                      className="rounded-lg border border-white/10 bg-[#0C131D] px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-white tabular-nums"
                    >
                      Pokaż kolejne (wyświetlono {visibleLimit} z {filteredLocations.length})
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
