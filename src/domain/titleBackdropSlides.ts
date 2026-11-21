import {buildFreePhotoProxyUrl, POLAND_LOCATIONS} from './polandLocations';
import type {PolandLocation} from './types';

export interface BackdropPhotoSlide {
  readonly id: string;
  readonly label: string;
  readonly voivodeship: string;
  readonly imageUrl: string;
  readonly lat: number;
  readonly lng: number;
}

export interface ISlideDeckCursor {
  readonly totalCount: number;
  next(failedIds: ReadonlySet<string>): BackdropPhotoSlide | null;
}

const OPENING_SCENIC_IDS: readonly string[] = [
  'zakopane',
  'gdansk',
  'krakow',
  'malbork',
  'hel',
  'warszawa',
  'karpacz',
  'sandomierz',
  'kazimierz-dolny',
  'zamosc',
];

const CURATED_LABELS: Readonly<Record<string, string>> = {
  zakopane: 'Tatry i Zakopane',
  malbork: 'Zamek w Malborku',
  hel: 'Półwysep Hel',
};

function resolveSlideImageUrl(loc: PolandLocation): string {
  const trimmed = loc.imageUrl.trim();
  if (
    trimmed.startsWith('/api/location-photo/image') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  ) {
    return trimmed;
  }
  return buildFreePhotoProxyUrl(loc.name, loc.voivodeship, loc.lat, loc.lng);
}

function toBackdropSlide(loc: PolandLocation): BackdropPhotoSlide {
  return {
    id: loc.id,
    label: CURATED_LABELS[loc.id] ?? loc.name,
    voivodeship: loc.voivodeship,
    imageUrl: resolveSlideImageUrl(loc),
    lat: loc.lat,
    lng: loc.lng,
  };
}

export function buildTitleBackdropSlides(
  source: readonly PolandLocation[] = POLAND_LOCATIONS,
): readonly BackdropPhotoSlide[] {
  const catalog = source.length > 0 ? source : POLAND_LOCATIONS;
  const seenIds = new Set<string>();
  const slides: BackdropPhotoSlide[] = [];

  for (const loc of catalog) {
    if (!loc.id || seenIds.has(loc.id)) {
      continue;
    }
    seenIds.add(loc.id);
    slides.push(toBackdropSlide(loc));
  }
  return slides;
}

function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

function buildCycleOrder(
  slides: readonly BackdropPhotoSlide[],
  lastId: string | null,
  prioritizeOpening: boolean,
  rng: () => number,
): BackdropPhotoSlide[] {
  const order = shuffleInPlace([...slides], rng);
  if (prioritizeOpening && order.length > 1) {
    const scenicIndices = order
      .map((s, idx) => (OPENING_SCENIC_IDS.includes(s.id) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (scenicIndices.length > 0) {
      const chosenIdx = scenicIndices[Math.floor(rng() * scenicIndices.length)];
      const [first] = order.splice(chosenIdx, 1);
      order.unshift(first);
    }
  } else if (lastId && order.length > 1 && order[0].id === lastId) {
    const swapIdx = 1 + Math.floor(rng() * (order.length - 1));
    const tmp = order[0];
    order[0] = order[swapIdx];
    order[swapIdx] = tmp;
  }
  return order;
}

export function createShuffledSlideDeck(
  slides: readonly BackdropPhotoSlide[],
  rng: () => number = Math.random,
): ISlideDeckCursor {
  let order: BackdropPhotoSlide[] = buildCycleOrder(slides, null, true, rng);
  let cursor = 0;
  let lastServedId: string | null = null;

  return {
    totalCount: slides.length,
    next(failedIds: ReadonlySet<string>): BackdropPhotoSlide | null {
      if (slides.length === 0 || failedIds.size >= slides.length) {
        return null;
      }
      for (let attempts = 0; attempts < slides.length * 2; attempts += 1) {
        if (cursor >= order.length) {
          order = buildCycleOrder(slides, lastServedId, false, rng);
          cursor = 0;
        }
        const candidate = order[cursor];
        cursor += 1;
        if (!failedIds.has(candidate.id)) {
          lastServedId = candidate.id;
          return candidate;
        }
      }
      return null;
    },
  };
}

export function formatSlideCaption(slide: BackdropPhotoSlide): string {
  return slide.voivodeship ? `${slide.label}, ${slide.voivodeship}` : slide.label;
}

export function formatSlideCoordinates(lat: number, lng: number): string {
  const latHemisphere = lat >= 0 ? 'N' : 'S';
  const lngHemisphere = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${latHemisphere}, ${Math.abs(lng).toFixed(3)}°${lngHemisphere}`;
}
