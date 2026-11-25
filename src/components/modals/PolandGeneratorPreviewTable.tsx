import React, {useMemo, useState} from 'react';
import {ImageOff, Search, Trash2} from 'lucide-react';
import {DIFFICULTY_LABELS} from '../../domain/catalogSchema';
import {POLISH_VOIVODESHIPS} from '../../domain/polandLocations';
import type {PolandLocation, RegionCategory} from '../../domain/types';

export interface PolandGeneratorPreviewTableProps {
  readonly locations: readonly PolandLocation[];
  readonly photoYears: Readonly<Record<string, number>>;
  readonly disabled: boolean;
  readonly onRemoveLocation: (id: string) => void;
}

const CATEGORY_LABELS: Readonly<Record<RegionCategory, string>> = {
  miasto: 'Miasto',
  zabytek: 'Zabytek',
  gory: 'Góry',
  morze: 'Morze',
  nad_woda: 'Nad wodą',
};

const CATEGORIES: readonly RegionCategory[] = ['miasto', 'zabytek', 'gory', 'morze', 'nad_woda'];

const PreviewThumbnail: React.FC<{readonly src: string; readonly name: string}> = ({src, name}) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#101822] text-slate-500">
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-11 w-16 shrink-0 rounded-md border border-white/10 object-cover bg-[#101822]"
    />
  );
};

export const PolandGeneratorPreviewTable: React.FC<PolandGeneratorPreviewTableProps> = ({
  locations,
  photoYears,
  disabled,
  onRemoveLocation,
}) => {
  const [query, setQuery] = useState('');
  const [voivFilter, setVoivFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<RegionCategory | 'all'>('all');
  const [visibleLimit, setVisibleLimit] = useState(30);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((loc) => {
      if (voivFilter !== 'all' && loc.voivodeship !== voivFilter) return false;
      if (catFilter !== 'all' && loc.regionCategory !== catFilter) return false;
      if (!q) return true;
      return (
        loc.name.toLowerCase().includes(q) ||
        loc.voivodeship.toLowerCase().includes(q) ||
        loc.hint.toLowerCase().includes(q) ||
        loc.id.toLowerCase().includes(q)
      );
    });
  }, [locations, query, voivFilter, catFilter]);

  if (locations.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-[#0C131D] p-8 text-center">
        <p className="text-sm font-semibold text-slate-200">
          Brak wygenerowanych kandydatów w podglądzie
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Kliknij „Generuj z Wikidaty” powyżej albo wczytaj wcześniej zapisany plik JSON, aby
          zweryfikować zdjęcia i podpowiedzi przed zapisaniem do Firebase.
        </p>
      </section>
    );
  }

  const visibleRows = filtered.slice(0, visibleLimit);

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-[#0C131D] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleLimit(30);
              }}
              placeholder="Szukaj w podglądzie (nazwa, podpowiedź, ID)…"
              className="min-h-[38px] w-full rounded-lg border border-white/10 bg-[#101822] pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={voivFilter}
            onChange={(e) => {
              setVoivFilter(e.target.value);
              setVisibleLimit(30);
            }}
            aria-label="Filtruj po województwie"
            className="min-h-[38px] rounded-lg border border-white/10 bg-[#101822] px-2.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">Wszystkie województwa</option>
            {POLISH_VOIVODESHIPS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={catFilter}
            onChange={(e) => {
              setCatFilter(e.target.value as RegionCategory | 'all');
              setVisibleLimit(30);
            }}
            aria-label="Filtruj po kategorii"
            className="min-h-[38px] rounded-lg border border-white/10 bg-[#101822] px-2.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">Wszystkie kategorie</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <span className="font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
          Widoczne: {visibleRows.length.toLocaleString('pl-PL')} /{' '}
          {filtered.length.toLocaleString('pl-PL')}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-[#101822] text-slate-400">
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Zdjęcie i miejsce</th>
              <th className="px-3 py-2.5 font-medium">Podpowiedź (Poziom 2, bez spoilerów)</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap text-right">Akcja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleRows.map((loc) => (
              <tr key={loc.id} className="align-top hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <PreviewThumbnail src={loc.imageUrl} name={loc.name} />
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{loc.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {loc.voivodeship} · {CATEGORY_LABELS[loc.regionCategory]} ·{' '}
                        {DIFFICULTY_LABELS[loc.difficulty ?? 'medium']}
                        {photoYears[loc.id] ? (
                          <span
                            className={`font-mono tabular-nums ${
                              photoYears[loc.id] >= 2025 ? 'text-emerald-300' : 'text-slate-400'
                            }`}
                          >
                            {' '}
                            · Zdjęcie {photoYears[loc.id]}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500 tabular-nums">
                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} · {loc.id}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="max-w-md px-3 py-2.5">
                  <p className="leading-relaxed text-slate-200">{loc.hint}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                    {loc.funFact}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemoveLocation(loc.id)}
                    aria-label={`Usuń ${loc.name} z zestawu`}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-white/10 bg-[#101822] px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-rose-500/45 hover:text-rose-200 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Odrzuć
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > visibleLimit && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisibleLimit((prev) => prev + 40)}
            className="min-h-[38px] rounded-lg border border-white/15 bg-[#101822] px-4 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-white"
          >
            Pokaż kolejne 40 ({(filtered.length - visibleLimit).toLocaleString('pl-PL')} pozostało)
          </button>
        </div>
      )}
    </section>
  );
};
