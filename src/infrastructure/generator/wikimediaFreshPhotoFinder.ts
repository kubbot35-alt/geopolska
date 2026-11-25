import {
  extractVerifiedPhotoYear,
  isSuspiciousPhotoFileName,
} from '../../domain/polandGeneratorSanitizer';
import {FRESH_PHOTO_MAX_YEAR, FRESH_PHOTO_MIN_YEAR} from '../../domain/polandGeneratorTypes';

const WIKI_USER_AGENT = 'GeoPolska-Atlas/1.0 (https://geopolska.app; educational geography game)';
const MIN_WIDTH_PX = 800;
const MIN_HEIGHT_PX = 450;
const MIN_ASPECT_RATIO = 0.75;
const MAX_ASPECT_RATIO = 2.5;
const MAX_IMAGE_URL_LENGTH = 500;
const SCENIC_KEYWORDS =
  /panorama|rynek|zamek|pa[lł]ac|ratusz|widok|dron|stare\s*miasto|ko[sś]ci[oó][lł]|bazylika|katedra|jezioro|pla[zż]a|molo|latarnia|szczyt|g[oó]ra|most|port|wybrze[zż]e/i;

export interface FreshPhotoLookupTarget {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly commonsCategory: string | null;
  readonly isCompactLandmark: boolean;
}

export interface FreshPhotoResult {
  readonly imageUrl: string;
  readonly year: number;
}

interface CommonsSearchImageInfo {
  readonly width?: number;
  readonly height?: number;
  readonly mime?: string;
  readonly thumburl?: string;
  readonly url?: string;
  readonly timestamp?: string;
  readonly extmetadata?: {
    readonly DateTimeOriginal?: {readonly value?: string};
  };
}

interface CommonsSearchPage {
  readonly title?: string;
  readonly coordinates?: ReadonlyArray<{readonly lat?: number; readonly lon?: number}>;
  readonly imageinfo?: readonly CommonsSearchImageInfo[];
}

interface CommonsSearchPayload {
  readonly query?: {
    readonly pages?: Readonly<Record<string, CommonsSearchPage>>;
  };
}

interface ScoredCandidate {
  readonly imageUrl: string;
  readonly year: number;
  readonly score: number;
}

function approxDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111.32;
  const dLng = (lng2 - lng1) * 111.32 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function isWithinTargetRadius(
  page: CommonsSearchPage,
  target: FreshPhotoLookupTarget,
  maxKm: number,
  requireGeoMatch: boolean,
): boolean {
  const coord = page.coordinates?.[0];
  if (typeof coord?.lat === 'number' && typeof coord?.lon === 'number') {
    return approxDistanceKm(target.lat, target.lng, coord.lat, coord.lon) <= maxKm;
  }
  return !requireGeoMatch;
}

function scoreFreshCandidate(
  page: CommonsSearchPage,
  target: FreshPhotoLookupTarget,
  minYear: number,
  maxKm: number,
  requireGeoMatch: boolean,
): ScoredCandidate | null {
  const info = page.imageinfo?.[0];
  if (!page.title || !info || info.mime !== 'image/jpeg') return null;
  if (!isWithinTargetRadius(page, target, maxKm, requireGeoMatch)) return null;

  const width = info.width ?? 0;
  const height = info.height ?? 0;
  if (width < MIN_WIDTH_PX || height < MIN_HEIGHT_PX) return null;

  const ratio = width / height;
  if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) return null;

  const cleanFileName = page.title.replace(/^File:/i, '').trim();
  if (!cleanFileName || isSuspiciousPhotoFileName(cleanFileName)) return null;

  const year = extractVerifiedPhotoYear(
    info.extmetadata?.DateTimeOriginal?.value,
    info.timestamp,
    cleanFileName,
  );
  if (!year || year < minYear || year > FRESH_PHOTO_MAX_YEAR) return null;

  const imageUrl = (info.thumburl ?? info.url ?? '').trim().split('?')[0] ?? '';
  if (!imageUrl.startsWith('https://') || imageUrl.length > MAX_IMAGE_URL_LENGTH) return null;

  let score = year === FRESH_PHOTO_MAX_YEAR ? 25 : 15;
  if (ratio >= 1.15 && ratio <= 1.95) score += 20;
  else if (ratio >= 1.0) score += 10;
  if (width >= 1600) score += 8;
  if (SCENIC_KEYWORDS.test(cleanFileName)) score += 15;
  const firstToken = target.name.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (firstToken.length >= 4 && cleanFileName.toLowerCase().includes(firstToken)) {
    score += 22;
  }
  return {imageUrl, year, score};
}

async function queryCommonsFreshSearch(
  gsrsearch: string,
  target: FreshPhotoLookupTarget,
  minYear: number,
  maxKm: number,
  requireGeoMatch: boolean,
  signal?: AbortSignal,
): Promise<FreshPhotoResult | null> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch,
    gsrsort: 'create_timestamp_desc',
    gsrlimit: '18',
    prop: 'imageinfo|coordinates',
    iiprop: 'size|mime|url|timestamp|extmetadata',
    iiurlwidth: '1280',
    format: 'json',
  });
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      headers: {'User-Agent': WIKI_USER_AGENT, Accept: 'application/json'},
      signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as CommonsSearchPayload;
    const pages = Object.values(payload.query?.pages ?? {});
    let best: ScoredCandidate | null = null;
    for (const page of pages) {
      const scored = scoreFreshCandidate(page, target, minYear, maxKm, requireGeoMatch);
      if (scored && (!best || scored.score > best.score)) {
        best = scored;
      }
    }
    return best ? {imageUrl: best.imageUrl, year: best.year} : null;
  } catch {
    return null;
  }
}

export async function findFreshCommonsPhoto(
  target: FreshPhotoLookupTarget,
  minYear: number = FRESH_PHOTO_MIN_YEAR,
  signal?: AbortSignal,
): Promise<FreshPhotoResult | null> {
  const radiusIntKm = target.isCompactLandmark ? 1 : 3;
  const nearQuery = `nearcoord:${radiusIntKm}km,${target.lat.toFixed(4)},${target.lng.toFixed(4)} filetype:bitmap`;
  const geoHit = await queryCommonsFreshSearch(
    nearQuery,
    target,
    minYear,
    radiusIntKm + 1,
    true,
    signal,
  );
  if (geoHit) {
    return geoHit;
  }
  if (target.commonsCategory) {
    const safeCat = target.commonsCategory.replace(/"/g, '');
    const catQuery = `incategory:"${safeCat}" filetype:bitmap`;
    return await queryCommonsFreshSearch(catQuery, target, minYear, 15, false, signal);
  }
  return null;
}

export async function resolveFreshPhotosConcurrently(
  targets: readonly FreshPhotoLookupTarget[],
  desiredMatches: number,
  concurrency = 6,
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, FreshPhotoResult>> {
  const results = new Map<string, FreshPhotoResult>();
  const usedUrls = new Set<string>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length && results.size < desiredMatches) {
      if (signal?.aborted) return;
      const idx = cursor;
      cursor += 1;
      const target = targets[idx];
      if (!target) return;
      const hit = await findFreshCommonsPhoto(target, FRESH_PHOTO_MIN_YEAR, signal);
      if (hit && !usedUrls.has(hit.imageUrl)) {
        usedUrls.add(hit.imageUrl);
        results.set(target.id, hit);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, targets.length));
  await Promise.all(Array.from({length: workerCount}, () => worker()));
  return results;
}
