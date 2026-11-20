import React, {useState} from 'react';
import {Check, Map as MapIcon, MapPin, Maximize2, Minimize2, X} from 'lucide-react';
import type {GeoCoordinate, MapStyleOption} from '../../domain/types';
import {PolandGoogleMap} from '../map/PolandGoogleMap';

export interface PlayingMapDockProps {
  readonly roundKey: string;
  readonly selectedGuess: GeoCoordinate | null;
  readonly mapStyle: MapStyleOption;
  readonly onChangeMapStyle: (style: MapStyleOption) => void;
  readonly onSelectGuess: (coord: GeoCoordinate) => void;
  readonly onSubmitGuess: () => void;
}

export const PlayingMapDock: React.FC<PlayingMapDockProps> = ({
  roundKey,
  selectedGuess,
  mapStyle,
  onChangeMapStyle,
  onSelectGuess,
  onSubmitGuess,
}) => {
  const [hovered, setHovered] = useState(false);
  const [pinnedLarge, setPinnedLarge] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isExpandedDesktop = hovered || pinnedLarge;

  return (
    <>
      {/* Desktop Expandable Bottom-Right Map Dock */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`fixed bottom-5 right-5 z-30 hidden flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0D151F]/95 shadow-[0_20px_60px_rgba(0,0,0,0.65)] transition-all duration-300 ease-out md:flex ${
          isExpandedDesktop
            ? 'h-[430px] w-[560px] lg:h-[460px] lg:w-[640px]'
            : 'h-[260px] w-[350px]'
        }`}
      >
        {/* Compact Dock Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0B121B] px-3.5 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              {selectedGuess
                ? 'Pinezka ustawiona (przeciągnij, aby poprawić)'
                : 'Wskaż miejsce na mapie Polski'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPinnedLarge((prev) => !prev)}
            aria-label={pinnedLarge ? 'Zmniejsz mapę' : 'Przypnij powiększoną mapę'}
            title={pinnedLarge ? 'Odepnij rozmiar mapy' : 'Przypnij powiększoną mapę'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {pinnedLarge ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Interactive Free Poland Map */}
        <div className="relative flex-1">
          <PolandGoogleMap
            mapStyle={mapStyle}
            onChangeMapStyle={onChangeMapStyle}
            mode={{
              kind: 'guess',
              roundKey,
              selectedGuess,
              onSelectGuess,
            }}
          />
        </div>

        {/* Submit Guess Action Bar */}
        <div className="border-t border-white/10 bg-[#0B121B] p-2.5">
          <button
            type="button"
            onClick={onSubmitGuess}
            disabled={!selectedGuess}
            className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-sm font-bold transition-all whitespace-nowrap ${
              selectedGuess
                ? 'bg-emerald-500 text-[#05120D] shadow-[0_0_24px_rgba(16,185,129,0.3)] hover:bg-emerald-400'
                : 'cursor-not-allowed bg-slate-800/90 text-slate-400'
            }`}
          >
            <Check className="h-4 w-4" />
            {selectedGuess ? 'Zatwierdź wybór' : 'Kliknij mapę, aby postawić pinezkę'}
          </button>
        </div>
      </div>

      {/* Mobile Floating Map Toggle & Slide-Up Drawer */}
      <div className="fixed bottom-5 right-4 z-30 md:hidden">
        {!mobileOpen && (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-emerald-500/45 bg-emerald-600 px-4 py-2.5 font-display text-sm font-bold text-white shadow-2xl whitespace-nowrap"
          >
            <MapIcon className="h-4 w-4" />
            {selectedGuess ? 'Mapa (pinezka gotowa)' : 'Otwórz mapę'}
          </button>
        )}
      </div>

      {mobileOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex h-[66vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/15 bg-[#0D151F] shadow-2xl md:hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <MapPin className="h-4 w-4 text-emerald-400" />
              Wskaż lokalizację w Polsce
            </span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Zwiń mapę"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex-1">
            <PolandGoogleMap
              mapStyle={mapStyle}
              onChangeMapStyle={onChangeMapStyle}
              mode={{
                kind: 'guess',
                roundKey,
                selectedGuess,
                onSelectGuess,
              }}
            />
          </div>

          <div className="border-t border-white/10 bg-[#0B121B] p-3">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onSubmitGuess();
              }}
              disabled={!selectedGuess}
              className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-sm font-bold transition-colors ${
                selectedGuess
                  ? 'bg-emerald-500 text-[#05120D] hover:bg-emerald-400'
                  : 'cursor-not-allowed bg-slate-800 text-slate-400'
              }`}
            >
              <Check className="h-4 w-4" />
              {selectedGuess ? 'Zatwierdź wybór' : 'Dotknij mapę, aby postawić pinezkę'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
