import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  CheckCircle2,
  CloudUpload,
  Database,
  Edit3,
  Loader2,
  Lock,
  LogIn,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import {
  POLAND_LOCATIONS,
  POLISH_VOIVODESHIPS,
  slugifyLocationId,
} from '../../domain/polandLocations';
import type {
  ILocationCatalogRepository,
  LocationCatalogState,
  LocationUpsertInput,
  PlayerIdentity,
  PolandLocation,
  RegionCategory,
} from '../../domain/types';

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
  readonly voivodeship: string;
  readonly lat: string;
  readonly lng: string;
  readonly imageUrl: string;
  readonly hint: string;
  readonly funFact: string;
  readonly regionCategory: RegionCategory;
  readonly isClassicOffline: boolean;
}

const EMPTY_FORM: LocationFormState = {
  editingId: null,
  name: '',
  voivodeship: 'Mazowieckie',
  lat: '52.2297',
  lng: '21.0122',
  imageUrl: '',
  hint: '',
  funFact: '',
  regionCategory: 'miasto',
  isClassicOffline: false,
};

function formatCatalogSourceLabel(state: LocationCatalogState): string {
  if (state.status === 'loading') {
    return 'Łączenie z Firebase Firestore...';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RegionCategory | 'all'>('all');
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
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM);
  const [savingForm, setSavingForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const migrationAbortRef = useRef<AbortController | null>(null);

  const isAdmin = Boolean(
    player &&
      player.emailVerified &&
      player.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase(),
  );

  useEffect(() => {
    if (!open) {
      migrationAbortRef.current?.abort();
      setConfirmDeleteId(null);
    }
    return () => {
      migrationAbortRef.current?.abort();
    };
  }, [open]);

  const filteredLocations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return locations.filter((loc) => {
      if (categoryFilter !== 'all' && loc.regionCategory !== categoryFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        loc.name.toLowerCase().includes(q) ||
        loc.voivodeship.toLowerCase().includes(q) ||
        loc.id.toLowerCase().includes(q)
      );
    });
  }, [locations, searchQuery, categoryFilter]);

  if (!open) {
    return null;
  }

  const remoteCount =
    catalogState.status === 'ready' ? catalogState.remoteCount : null;
  const catalogVersion =
    catalogState.status === 'ready' ? catalogState.version : null;
  const isCloudPopulated =
    catalogState.status === 'ready' && catalogState.isSyncedWithCloud;

  const handleMigrateSeed = async () => {
    if (!player || !isAdmin || !isOnline || migrating) {
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
      text: `Przeniesiono ${result.value.totalCount.toLocaleString('pl-PL')} lokacji do Firebase Firestore (wersja katalogu v${result.value.version}).`,
    });
  };

  const handleForceRefresh = async () => {
    if (!isOnline || refreshing) {
      return;
    }
    setRefreshing(true);
    setFeedback(null);
    await onRefreshCatalog(true);
    setRefreshing(false);
    setFeedback({
      tone: 'success',
      text: 'Odświeżono katalog lokacji z Firebase Firestore.',
    });
  };

  const handleStartCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setFeedback(null);
  };

  const handleStartEdit = (loc: PolandLocation) => {
    setForm({
      editingId: loc.id,
      name: loc.name,
      voivodeship: loc.voivodeship,
      lat: String(loc.lat),
      lng: String(loc.lng),
      imageUrl: loc.imageUrl,
      hint: loc.hint,
      funFact: loc.funFact,
      regionCategory: loc.regionCategory,
      isClassicOffline: Boolean(loc.isClassicOffline),
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
    if (
      !Number.isFinite(parsedLat) ||
      parsedLat < 48.5 ||
      parsedLat > 55.5 ||
      !Number.isFinite(parsedLng) ||
      parsedLng < 13.5 ||
      parsedLng > 25.0
    ) {
      setFeedback({
        tone: 'error',
        text: 'Współrzędne muszą leżeć w granicach Polski (lat: 48.5–55.5, lng: 13.5–25.0).',
      });
      return;
    }

    const input: LocationUpsertInput = {
      id: form.editingId ?? slugifyLocationId(form.name),
      name: form.name,
      voivodeship: form.voivodeship,
      lat: parsedLat,
      lng: parsedLng,
      imageUrl: form.imageUrl,
      hint: form.hint,
      funFact: form.funFact,
      regionCategory: form.regionCategory,
      isClassicOffline: form.isClassicOffline,
    };

    const maxOrder = locations.reduce(
      (acc, loc) => (typeof loc.orderIndex === 'number' && loc.orderIndex > acc ? loc.orderIndex : acc),
      locations.length,
    );

    setSavingForm(true);
    setFeedback(null);

    const res = await repository.upsertLocation(input, player.uid, maxOrder + 1);
    setSavingForm(false);

    if (!res.ok) {
      setFeedback({tone: 'error', text: res.error});
      return;
    }

    await onCatalogMutated();
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setFeedback({
      tone: 'success',
      text: form.editingId
        ? `Zaktualizowano lokację „${res.value.name}” w Firebase Firestore.`
        : `Dodano lokację „${res.value.name}” do Firebase Firestore.`,
    });
  };

  const handleConfirmDelete = async (locationId: string) => {
    if (!player || !isAdmin || !isOnline || deletingId) {
      return;
    }
    setDeletingId(locationId);
    setFeedback(null);
    const res = await repository.deleteLocation(locationId, player.uid);
    setDeletingId(null);
    setConfirmDeleteId(null);

    if (!res.ok) {
      setFeedback({tone: 'error', text: res.error});
      return;
    }

    await onCatalogMutated();
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
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101822] text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Baza Lokacji Firebase Firestore
              </h2>
              <p className="text-xs text-slate-400">{formatCatalogSourceLabel(catalogState)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              Tryb offline — gra korzysta z lokalnej kopii katalogu. Migracja i edycja wymagają sieci.
            </div>
          )}

          {/* Summary KPIs & Migration Bar */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-[#0C131D] p-3.5">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Aktywne w grze
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                {locations.length.toLocaleString('pl-PL')}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0C131D] p-3.5">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                W Firebase (/locations)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                {remoteCount !== null ? remoteCount.toLocaleString('pl-PL') : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0C131D] p-3.5">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Wersja manifestu
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
                  Synchronizacja i zarządzanie katalogiem w chmurze
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Katalog korzysta z manifestu 1-odczytowego i pamięci IndexedDB, aby minimalizować zużycie limitu Firestore.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleForceRefresh()}
                  disabled={!isOnline || refreshing || migrating}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#101822] px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-white disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Odśwież z Firebase
                </button>

                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleMigrateSeed()}
                      disabled={!isOnline || migrating}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400 disabled:opacity-50"
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

                    <button
                      type="button"
                      onClick={handleStartCreate}
                      disabled={!isOnline || migrating}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
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
                  Zaloguj się na konto administratora ({BOOTSTRAPPED_ADMIN_EMAIL}), aby przenieść 1 100 lokacji do Firebase lub edytować bazę.
                </p>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Zaloguj Google
                </button>
              </div>
            )}

            {player && !isAdmin && (
              <p className="rounded-lg border border-white/10 bg-[#101822] p-3 text-xs text-slate-400">
                Jesteś zalogowany jako <span className="text-slate-200">{player.email || player.displayName}</span>. Zapis i migracja katalogu w Firestore są chronione uprawnieniami administratora.
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
              className="space-y-3 rounded-xl border border-emerald-500/30 bg-[#0C131D] p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-white">
                  {form.editingId ? `Edycja lokacji (${form.editingId})` : 'Nowa lokacja w Firebase'}
                </h3>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Anuluj
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                    Nazwa miejsca
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({...prev, name: e.target.value}))}
                    placeholder="np. Zamek w Ogrodzieńcu"
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                    Województwo
                  </label>
                  <select
                    value={form.voivodeship}
                    onChange={(e) => setForm((prev) => ({...prev, voivodeship: e.target.value}))}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {POLISH_VOIVODESHIPS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                    Kategoria
                  </label>
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
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                    Szerokość (lat)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.lat}
                    onChange={(e) => setForm((prev) => ({...prev, lat: e.target.value}))}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                    Długość (lng)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.lng}
                    onChange={(e) => setForm((prev) => ({...prev, lng: e.target.value}))}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-white/10 bg-[#101822] px-3 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                    URL zdjęcia (puste = auto proxy)
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
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                    Podpowiedź (bez nazwy miasta)
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
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase">
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

                <button
                  type="submit"
                  disabled={savingForm}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400 disabled:opacity-50"
                >
                  {savingForm && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {form.editingId ? 'Zapisz zmiany w Firebase' : 'Dodaj do Firebase'}
                </button>
              </div>
            </form>
          )}

          {/* Search & List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleLimit(40);
                  }}
                  placeholder="Szukaj po nazwie, województwie lub ID..."
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
                <option value="all">Wszystkie kategorie ({locations.length})</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-[#0C131D]">
              {filteredLocations.slice(0, visibleLimit).map((loc) => (
                <div
                  key={loc.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{loc.name}</span>
                      <span className="text-slate-400">{loc.voivodeship}</span>
                      <span className="font-mono text-[11px] text-emerald-400">
                        {CATEGORY_LABELS[loc.regionCategory]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      <span className="font-mono text-slate-500">
                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      </span>{' '}
                      · {loc.hint}
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
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
              ))}

              {filteredLocations.length === 0 && (
                <p className="p-6 text-center text-xs text-slate-400">
                  Brak lokacji pasujących do filtra.
                </p>
              )}
            </div>

            {filteredLocations.length > visibleLimit && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 60)}
                  className="rounded-lg border border-white/10 bg-[#0C131D] px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-white"
                >
                  Pokaż kolejne (wyświetlono {visibleLimit} z {filteredLocations.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
