import React from 'react';
import {MapPin} from 'lucide-react';
import {
  formatSlideCaption,
  formatSlideCoordinates,
  type BackdropPhotoSlide,
} from '../../domain/titleBackdropSlides';
import {
  usePhotoSlideshow,
  type SlideshowBufferSlot,
} from '../../hooks/usePhotoSlideshow';

export interface PhotoBackdropSlideshowProps {
  readonly slides: readonly BackdropPhotoSlide[];
  readonly intervalMs?: number;
}

interface SlideBufferLayerProps {
  readonly slot: SlideshowBufferSlot | null;
  readonly isActive: boolean;
}

const SlideBufferLayer: React.FC<SlideBufferLayerProps> = ({slot, isActive}) => (
  <div
    aria-hidden="true"
    className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${
      isActive ? 'z-[2] opacity-100' : 'z-[1] opacity-0'
    }`}
  >
    {slot && (
      <img
        key={slot.renderKey}
        src={slot.slide.imageUrl}
        alt={slot.slide.label}
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover object-center geopolska-ken-burns"
      />
    )}
  </div>
);

export const PhotoBackdropSlideshow: React.FC<PhotoBackdropSlideshowProps> = ({
  slides,
  intervalMs = 9000,
}) => {
  const {slots, activeBuffer} = usePhotoSlideshow(slides, intervalMs);
  const activeSlide = activeBuffer !== null ? slots[activeBuffer]?.slide ?? null : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#0C0E12]">
      <SlideBufferLayer slot={slots[0]} isActive={activeBuffer === 0} />
      <SlideBufferLayer slot={slots[1]} isActive={activeBuffer === 1} />

      {/* Smooth directional readability gradient: legible left column, open right photograph */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[3] bg-[linear-gradient(180deg,rgba(12,14,18,0.84)_0%,rgba(12,14,18,0.72)_54%,rgba(12,14,18,0.88)_100%)] lg:bg-[linear-gradient(90deg,rgba(12,14,18,0.92)_0%,rgba(12,14,18,0.65)_42%,rgba(12,14,18,0.1)_100%)]"
      />

      {/* Subtle top edge scrim for crisp header contrast over bright skies */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-[3] h-28 bg-gradient-to-b from-[#0C0E12]/65 to-transparent"
      />

      {activeSlide && (
        <aside
          aria-label="Aktualna lokalizacja na zdjęciu w tle"
          className="absolute right-5 bottom-5 z-20 flex max-w-[calc(100vw-2.5rem)] items-center gap-1.5 text-xs text-neutral-200/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.85)] sm:right-8 sm:bottom-6"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-300" aria-hidden="true" />
          <span className="truncate font-medium tracking-tight text-white">
            {formatSlideCaption(activeSlide)}
          </span>
          <span aria-hidden="true" className="shrink-0 text-neutral-400">
            •
          </span>
          <span className="shrink-0 font-mono text-[11px] text-neutral-300 tabular-nums">
            {formatSlideCoordinates(activeSlide.lat, activeSlide.lng)}
          </span>
        </aside>
      )}
    </div>
  );
};
