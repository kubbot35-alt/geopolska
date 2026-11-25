import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CheckCircle2, AlertCircle} from 'lucide-react';
import {normalizeGeneratedLocationInput} from '../../domain/polandGeneratorSanitizer';
import {
  DEFAULT_PER_VOIVODESHIP_LIMIT,
  DEFAULT_PHOTO_FRESHNESS,
  POLISH_VOIVODESHIP_CONFIGS,
  type CatalogReplaceProgress,
  type IPolandGeneratorGateway,
  type PhotoFreshnessMode,
  type VoivodeshipProgressState,
} from '../../domain/polandGeneratorTypes';
import {FEATURED_OFFLINE_LOCATIONS} from '../../domain/polandLocations';
import type {ILocationCatalogRepository, PlayerIdentity, PolandLocation} from '../../domain/types';
import {polandGeneratorGateway} from '../../infrastructure/generator/polandGeneratorGateway';
import {PolandGeneratorConfigBar} from './PolandGeneratorConfigBar';
import {PolandGeneratorPreviewTable} from './PolandGeneratorPreviewTable';
import {PolandGeneratorProgressGrid} from './PolandGeneratorProgressGrid';

export interface PolandGeneratorPanelProps {
  readonly repository: ILocationCatalogRepository;
  readonly gateway?: IPolandGeneratorGateway;
  readonly existingPolandLocations: readonly PolandLocation[];
  readonly player: PlayerIdentity | null;
  readonly isAdmin: boolean;
  readonly isOnline: boolean;
  readonly onCatalogMutated: () => Promise<void>;
}

function buildInitialProgress(voivodeships: readonly string[]): readonly VoivodeshipProgressState[] {
  return voivodeships.map((name) => ({
    voivodeship: name,
    status: 'idle',
    collected: 0,
    rejected: 0,
    errorMessage: null,
  }));
}

function formatLogEntry(message: string): string {
  return `[${new Date().toLocaleTimeString('pl-PL')}] ${message}`;
}

export const PolandGeneratorPanel: React.FC<PolandGeneratorPanelProps> = ({
  repository,
  gateway = polandGeneratorGateway,
  existingPolandLocations,
  player,
  isAdmin,
  isOnline,
  onCatalogMutated,
}) => {
  const [perVoivodeshipLimit, setPerVoivodeshipLimit] = useState(DEFAULT_PER_VOIVODESHIP_LIMIT);
  const [photoFreshness, setPhotoFreshness] = useState<PhotoFreshnessMode>(DEFAULT_PHOTO_FRESHNESS);
  const [selectedVoivodeships, setSelectedVoivodeships] = useState<readonly string[]>(() =>
    POLISH_VOIVODESHIP_CONFIGS.map((cfg) => cfg.name),
  );
  const [progressList, setProgressList] = useState<readonly VoivodeshipProgressState[]>([]);
  const [generatedLocations, setGeneratedLocations] = useState<readonly PolandLocation[]>([]);
  const [photoYears, setPhotoYears] = useState<Readonly<Record<string, number>>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<CatalogReplaceProgress | null>(null);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Gotowy do wygenerowania bazy Polski.');
  const [logs, setLogs] = useState<readonly string[]>([]);
  const [feedback, setFeedback] = useState<{readonly tone: 'success' | 'error'; readonly text: string} | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const existingOnlineCount = useMemo(
    () => existingPolandLocations.filter((loc) => loc.isClassicOffline !== true).length,
    [existingPolandLocations],
  );

  const appendLog = (message: string) => {
    setLogs((prev) => [formatLogEntry(message), ...prev].slice(0, 80));
  };

  const handleToggleVoivodeship = (name: string) => {
    setSelectedVoivodeships((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  const handleStartGenerate = async () => {
    if (isGenerating || isUploading || !isOnline || selectedVoivodeships.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setConfirmReplaceOpen(false);
    setFeedback(null);
    setGeneratedLocations([]);
    setPhotoYears({});
    setLogs([]);
    setProgressList(buildInitialProgress(selectedVoivodeships));

    const seenIds = new Set<string>(FEATURED_OFFLINE_LOCATIONS.map((loc) => loc.id));
    const excludedNames: string[] = FEATURED_OFFLINE_LOCATIONS.map((loc) => loc.name);
    const seenNameSet = new Set<string>(excludedNames.map((n) => n.toLowerCase()));
    const collected: PolandLocation[] = [];
    const collectedYears: Record<string, number> = {};

    for (let i = 0; i < selectedVoivodeships.length; i += 1) {
      if (controller.signal.aborted) break;
      const voiv = selectedVoivodeships[i];
      setStatusMessage(
        `Pobieranie ${i + 1}/${selectedVoivodeships.length}: ${voiv} (zebrano: ${collected.length.toLocaleString('pl-PL')})…`,
      );
      setProgressList((prev) =>
        prev.map((item) => (item.voivodeship === voiv ? {...item, status: 'loading'} : item)),
      );
      appendLog(`Rozpoczęto wyszukiwanie zdjęć i danych dla woj. ${voiv}…`);

      const res = await gateway.generateForVoivodeship(
        {
          voivodeship: voiv,
          limit: perVoivodeshipLimit,
          excludeNames: excludedNames,
          photoFreshness,
        },
        controller.signal,
      );

      if (controller.signal.aborted) {
        appendLog(`Przerwano pobieranie na woj. ${voiv}.`);
        break;
      }

      if (!res.ok) {
        appendLog(`Błąd woj. ${voiv}: ${res.error}`);
        setProgressList((prev) =>
          prev.map((item) =>
            item.voivodeship === voiv
              ? {...item, status: 'error', errorMessage: res.error}
              : item,
          ),
        );
        continue;
      }

      let addedInVoiv = 0;
      for (const loc of res.value.locations) {
        const nameKey = loc.name.trim().toLowerCase();
        if (seenIds.has(loc.id) || seenNameSet.has(nameKey)) continue;
        seenIds.add(loc.id);
        seenNameSet.add(nameKey);
        excludedNames.push(loc.name);
        if (res.value.photoYears[loc.id]) {
          collectedYears[loc.id] = res.value.photoYears[loc.id];
        }
        collected.push({...loc, orderIndex: FEATURED_OFFLINE_LOCATIONS.length + collected.length});
        addedInVoiv += 1;
      }

      setGeneratedLocations([...collected]);
      setPhotoYears({...collectedYears});
      setProgressList((prev) =>
        prev.map((item) =>
          item.voivodeship === voiv
            ? {
                ...item,
                status: 'done',
                collected: addedInVoiv,
                rejected: res.value.stats.rejectedQuality,
              }
            : item,
        ),
      );
      appendLog(
        `Woj. ${voiv}: dodano ${addedInVoiv} miejsc (zdjęcia 2025–2026: ${res.value.stats.freshPhotoCount}, odrzucono: ${res.value.stats.rejectedQuality}).`,
      );
    }

    setIsGenerating(false);
    setStatusMessage(
      controller.signal.aborted
        ? `Zatrzymano. W podglądzie zachowano ${collected.length.toLocaleString('pl-PL')} lokalizacji.`
        : `Zakończono generowanie: ${collected.length.toLocaleString('pl-PL')} zweryfikowanych lokalizacji online (+ 20 klasycznych offline).`,
    );
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(generatedLocations, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `geopolska_locations_poland_${generatedLocations.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw: unknown = JSON.parse(String(reader.result ?? '[]'));
        if (!Array.isArray(raw)) {
          setFeedback({tone: 'error', text: 'Plik JSON musi zawierać tablicę obiektów lokalizacji.'});
          return;
        }
        const classicIds = new Set<string>(FEATURED_OFFLINE_LOCATIONS.map((loc) => loc.id));
        const valid: PolandLocation[] = [];
        const seen = new Set<string>();
        let skipped = 0;
        for (const item of raw) {
          const clean = normalizeGeneratedLocationInput(item);
          if (!clean || classicIds.has(clean.id) || seen.has(clean.id)) {
            skipped += 1;
            continue;
          }
          seen.add(clean.id);
          valid.push({...clean, orderIndex: FEATURED_OFFLINE_LOCATIONS.length + valid.length});
        }
        setGeneratedLocations(valid);
        setConfirmReplaceOpen(false);
        setStatusMessage(
          `Wczytano z pliku JSON: ${valid.length.toLocaleString('pl-PL')} poprawnych lokalizacji (pominięto: ${skipped}).`,
        );
        setFeedback({
          tone: valid.length > 0 ? 'success' : 'error',
          text:
            valid.length > 0
              ? `Zaimportowano ${valid.length.toLocaleString('pl-PL')} lokalizacji do podglądu.`
              : 'Żaden wpis w pliku nie spełnił wymogów schematu Polski.',
        });
      } catch {
        setFeedback({tone: 'error', text: 'Nie udało się odczytać pliku JSON — sprawdź składnię.'});
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmReplace = async () => {
    if (!player || !isAdmin || !isOnline || isUploading || generatedLocations.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setConfirmReplaceOpen(false);
    setIsUploading(true);
    setFeedback(null);
    setUploadProgress({phase: 'reading', processed: 0, total: 1});
    appendLog(`Rozpoczęto zastępowanie bazy online w Firestore (${generatedLocations.length} lokacji)…`);

    const result = await repository.replacePolandOnlineCatalog(
      generatedLocations,
      player.uid,
      (progress) => setUploadProgress(progress),
      controller.signal,
    );

    setIsUploading(false);
    setUploadProgress(null);

    if (!result.ok) {
      appendLog(`Błąd zapisu Firestore: ${result.error}`);
      setFeedback({tone: 'error', text: result.error});
      return;
    }

    await onCatalogMutated();
    const s = result.value;
    const summaryText = `Zapisano bazę Polski (manifest v${s.meta.version}): ${s.totalCount.toLocaleString('pl-PL')} łącznie (${s.classicPreserved} offline + ${s.writtenCount.toLocaleString('pl-PL')} online, usunięto ${s.deletedCount.toLocaleString('pl-PL')} starych).`;
    appendLog(summaryText);
    setStatusMessage(summaryText);
    setFeedback({tone: 'success', text: summaryText});
  };

  return (
    <div className="space-y-4">
      <PolandGeneratorConfigBar
        perVoivodeshipLimit={perVoivodeshipLimit}
        photoFreshness={photoFreshness}
        selectedVoivodeships={selectedVoivodeships}
        generatedCount={generatedLocations.length}
        existingOnlineCount={existingOnlineCount}
        isGenerating={isGenerating}
        isUploading={isUploading}
        isAdmin={isAdmin}
        isOnline={isOnline}
        confirmReplaceOpen={confirmReplaceOpen}
        onLimitChange={setPerVoivodeshipLimit}
        onPhotoFreshnessChange={setPhotoFreshness}
        onToggleVoivodeship={handleToggleVoivodeship}
        onSelectAllVoivodeships={() =>
          setSelectedVoivodeships(POLISH_VOIVODESHIP_CONFIGS.map((cfg) => cfg.name))
        }
        onClearVoivodeships={() => setSelectedVoivodeships([])}
        onStartGenerate={() => void handleStartGenerate()}
        onStopGenerate={() => abortRef.current?.abort()}
        onDownloadJson={handleDownloadJson}
        onImportJsonFile={handleImportJsonFile}
        onRequestReplace={() => setConfirmReplaceOpen(true)}
        onCancelReplace={() => setConfirmReplaceOpen(false)}
        onConfirmReplace={() => void handleConfirmReplace()}
      />

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
            feedback.tone === 'success'
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/35 bg-rose-950/40 text-rose-200'
          }`}
        >
          {feedback.tone === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span className="break-words">{feedback.text}</span>
        </div>
      )}

      <PolandGeneratorProgressGrid
        progressList={progressList}
        isGenerating={isGenerating}
        statusMessage={statusMessage}
        uploadProgress={uploadProgress}
        logs={logs}
      />

      <PolandGeneratorPreviewTable
        locations={generatedLocations}
        photoYears={photoYears}
        disabled={isGenerating || isUploading}
        onRemoveLocation={(id) =>
          setGeneratedLocations((prev) => prev.filter((item) => item.id !== id))
        }
      />
    </div>
  );
};
