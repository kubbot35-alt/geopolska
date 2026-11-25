import {extractVerifiedPhotoYear} from '../../domain/polandGeneratorSanitizer';

const WIKI_USER_AGENT = 'GeoPolska-Atlas/1.0 (https://geopolska.app; educational geography game)';
const IMAGE_BATCH_SIZE = 45;
const EXTRACT_BATCH_SIZE = 20;
const MIN_WIDTH_PX = 800;
const MIN_HEIGHT_PX = 450;
const MIN_ASPECT_RATIO = 0.75;
const MAX_ASPECT_RATIO = 2.5;
const MAX_IMAGE_URL_LENGTH = 500;

export interface VerifiedCommonsImage {
  readonly fileName: string;
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly year: number | null;
}

interface CommonsPageImageInfo {
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

interface CommonsQueryPayload {
  readonly query?: {
    readonly normalized?: ReadonlyArray<{readonly from?: string; readonly to?: string}>;
    readonly pages?: Readonly<
      Record<string, {readonly title?: string; readonly imageinfo?: readonly CommonsPageImageInfo[]}>
    >;
  };
}

function chunkItems<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeFileName(raw: string): string {
  return raw.replace(/^File:/i, '').replace(/_/g, ' ').trim();
}

function isAcceptableImageInfo(info: CommonsPageImageInfo | undefined): boolean {
  if (!info || info.mime !== 'image/jpeg') {
    return false;
  }
  const width = info.width ?? 0;
  const height = info.height ?? 0;
  if (width < MIN_WIDTH_PX || height < MIN_HEIGHT_PX) {
    return false;
  }
  const ratio = width / height;
  return ratio >= MIN_ASPECT_RATIO && ratio <= MAX_ASPECT_RATIO;
}

function resolveVerifiedThumbUrl(info: CommonsPageImageInfo): string | null {
  const raw = (info.thumburl ?? info.url ?? '').trim();
  const candidate = raw.split('?')[0] ?? '';
  if (!candidate.startsWith('https://') || candidate.length > MAX_IMAGE_URL_LENGTH) {
    return null;
  }
  return candidate;
}

async function fetchCommonsBatch(
  fileNames: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, VerifiedCommonsImage>> {
  const titles = fileNames.map((name) => `File:${name}`).join('|');
  const params = new URLSearchParams({
    action: 'query',
    titles,
    prop: 'imageinfo',
    iiprop: 'size|mime|url|timestamp|extmetadata',
    iiurlwidth: '1280',
    format: 'json',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: {'User-Agent': WIKI_USER_AGENT, Accept: 'application/json'},
    signal,
  });
  if (!response.ok) {
    return new Map();
  }
  const payload = (await response.json()) as CommonsQueryPayload;
  const pages = payload.query?.pages;
  if (!pages) {
    return new Map();
  }
  const verified = new Map<string, VerifiedCommonsImage>();
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!page.title || !isAcceptableImageInfo(info) || !info) {
      continue;
    }
    const imageUrl = resolveVerifiedThumbUrl(info);
    if (!imageUrl) {
      continue;
    }
    const cleanName = normalizeFileName(page.title);
    const key = cleanName.toLowerCase();
    verified.set(key, {
      fileName: cleanName,
      imageUrl,
      width: info.width ?? 0,
      height: info.height ?? 0,
      year: extractVerifiedPhotoYear(
        info.extmetadata?.DateTimeOriginal?.value,
        info.timestamp,
        cleanName,
      ),
    });
  }
  return verified;
}

export async function batchVerifyCommonsImages(
  fileNames: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, VerifiedCommonsImage>> {
  const uniqueNames = [...new Set(fileNames.map(normalizeFileName).filter(Boolean))];
  const merged = new Map<string, VerifiedCommonsImage>();
  for (const batch of chunkItems(uniqueNames, IMAGE_BATCH_SIZE)) {
    const partial = await fetchCommonsBatch(batch, signal);
    partial.forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

interface WikiTitleAlias {
  readonly from?: string;
  readonly to?: string;
}

interface WikiExtractsPayload {
  readonly query?: {
    readonly normalized?: readonly WikiTitleAlias[];
    readonly redirects?: readonly WikiTitleAlias[];
    readonly pages?: Readonly<Record<string, {readonly title?: string; readonly extract?: string}>>;
  };
}

function attachAliasExtracts(
  extracts: Map<string, string>,
  aliases: readonly WikiTitleAlias[] | undefined,
): void {
  if (!aliases) return;
  for (const alias of aliases) {
    if (!alias.from || !alias.to) continue;
    const resolved = extracts.get(alias.to.trim().toLowerCase());
    if (resolved) {
      extracts.set(alias.from.trim().toLowerCase(), resolved);
    }
  }
}

async function fetchExtractsBatch(
  titles: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const params = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exchars: '900',
    redirects: '1',
    format: 'json',
  });
  const response = await fetch(`https://pl.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: {'User-Agent': WIKI_USER_AGENT, Accept: 'application/json'},
    signal,
  });
  if (!response.ok) {
    return new Map();
  }
  const payload = (await response.json()) as WikiExtractsPayload;
  const pages = payload.query?.pages;
  if (!pages) {
    return new Map();
  }
  const extracts = new Map<string, string>();
  for (const page of Object.values(pages)) {
    if (page.title && page.extract && page.extract.trim().length > 0) {
      extracts.set(page.title.trim().toLowerCase(), page.extract.trim());
    }
  }
  attachAliasExtracts(extracts, payload.query?.redirects);
  attachAliasExtracts(extracts, payload.query?.normalized);
  return extracts;
}

export async function batchFetchPolishWikiExtracts(
  articleTitles: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const uniqueTitles = [...new Set(articleTitles.map((t) => t.replace(/_/g, ' ').trim()).filter(Boolean))];
  const merged = new Map<string, string>();
  for (const batch of chunkItems(uniqueTitles, EXTRACT_BATCH_SIZE)) {
    const partial = await fetchExtractsBatch(batch, signal);
    partial.forEach((value, key) => merged.set(key, value));
  }
  return merged;
}
