import {z} from 'zod';
import {normalizeLocationTags, validateCoordinatesForCatalog} from './catalogSchema';
import {findVoivodeshipConfig} from './polandGeneratorTypes';
import type {LocationDifficulty, PolandLocation, RegionCategory} from './types';

const BAD_IMAGE_PATTERNS: readonly RegExp[] = [
  /herb/i, /\bcoa\b/i, /coat[_\s-]?of[_\s-]?arms/i, /wappen/i, /blason/i,
  /flaga?/i, /logo/i, /god[lł]o/i, /piecz[eę][cć]/i, /\bseal\b/i,
  /\bmap[ay]?\b/i, /locator/i, /location[_\s-]?map/i, /po[lł]o[zż]enie/i,
  /plan[_\s-]/i, /schemat/i, /diagram/i, /wykres/i, /\bchart\b/i,
  /collage/i, /monta[zżg]/i, /banner/i, /tablica/i, /\bznak\b/i,
  /mapa[_\s-]/i, /gmina[_\s-]/i, /powiat[_\s-]/i, /wojew[oó]dztwo/i,
  /cmentarz/i, /nagrob/i, /pomnik[_\s-]?nagrob/i, /\bgrave\b/i, /\btomb\b/i,
  /festiwal/i, /koncert/i, /\bmecz\b/i, /\bmks\b/i, /dru[zż]yn/i,
  /krzy[zż][_\s-]+przydro[zż]/i, /\ben\d{2}\b/i, /\bep\d{2}\b/i, /\beu\d{2}\b/i,
  /\bsm\d{2}\b/i, /poci[aą]g/i, /lokomotyw/i, /autobus/i, /tramwaj/i,
  /plakat/i, /ok[lł]adka/i, /reklam/i, /paragon/i, /bilet/i, /dokument/i,
  /poczt[oó]wk/i, /postcard/i, /gravure/i, /rycina/i, /litograf/i,
  /\biss\d+/i, /view[_\s-]+of[_\s-]+earth/i, /sentinel-\d/i, /landsat/i, /satellite/i,
];

const MOUNTAIN_TYPE_QIDS = new Set(['Q8502', 'Q46831', 'Q39816', 'Q46169', 'Q179049', 'Q34038']);
const WATER_TYPE_QIDS = new Set(['Q23397', 'Q23442', 'Q4022']);
const SEA_TYPE_QIDS = new Set(['Q34763', 'Q39715', 'Q863454', 'Q40080']);
const MONUMENT_TYPE_QIDS = new Set([
  'Q23413', 'Q16560', 'Q57821', 'Q2977', 'Q16970', 'Q44613',
  'Q33506', 'Q4989906', 'Q839954', 'Q207694', 'Q16999091',
]);

const CATEGORY_FALLBACK_HINTS: Readonly<Record<RegionCategory, string>> = {
  gory: 'Malowniczy punkt w pasmach górskich lub podgórskich Polski z charakterystyczną rzeźbą terenu.',
  morze: 'Nadmorska lokalizacja w pasie polskiego wybrzeża Bałtyku i strefie zatokowej.',
  zabytek: 'Historyczny obiekt zabytkowy o wyróżniającej się architekturze i wielowiekowej tradycji.',
  nad_woda: 'Malownicze miejsce położone nad polskimi jeziorami, rzekami lub kanałami żeglownymi.',
  miasto: 'Charakterystyczna polska miejscowość o rozpoznawalnej historycznej zabudowie i układzie urbanistycznym.',
};

const CATEGORY_TAG_LABEL: Readonly<Record<RegionCategory, string>> = {
  miasto: 'miasto',
  zabytek: 'zabytek',
  gory: 'góry',
  morze: 'morze',
  nad_woda: 'nad wodą',
};

const VOIVODESHIP_LOCATIVE: Readonly<Record<string, string>> = {
  Dolnośląskie: 'dolnośląskim',
  'Kujawsko-Pomorskie': 'kujawsko-pomorskim',
  Lubelskie: 'lubelskim',
  Lubuskie: 'lubuskim',
  Łódzkie: 'łódzkim',
  Małopolskie: 'małopolskim',
  Mazowieckie: 'mazowieckim',
  Opolskie: 'opolskim',
  Podkarpackie: 'podkarpackim',
  Podlaskie: 'podlaskim',
  Pomorskie: 'pomorskim',
  Śląskie: 'śląskim',
  Świętokrzyskie: 'świętokrzyskim',
  'Warmińsko-Mazurskie': 'warmińsko-mazurskim',
  Wielkopolskie: 'wielkopolskim',
  Zachodniopomorskie: 'zachodniopomorskim',
};

export function truncateClean(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  const sliced = compact.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = lastSpace > maxLength * 0.65 ? sliced.slice(0, lastSpace) : sliced;
  return `${base.replace(/[,;:\-–]+$/, '').trimEnd()}…`;
}

export function isSuspiciousPhotoFileName(rawImageUrl: string): boolean {
  const fileName = decodeURIComponent(rawImageUrl.split('/').pop() ?? '');
  if (!/\.(jpe?g)$/i.test(fileName)) {
    return true;
  }
  return BAD_IMAGE_PATTERNS.some((pattern) => pattern.test(fileName));
}

export function extractVerifiedPhotoYear(
  dateTimeOriginal: string | undefined,
  uploadTimestamp: string | undefined,
  fileName: string,
): number | null {
  const cleanOrig = (dateTimeOriginal ?? '').replace(/<[^>]+>/g, ' ').trim();
  const origYears = cleanOrig.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/g);
  if (origYears && origYears.length > 0) {
    return Math.min(...origYears.map((y) => Number.parseInt(y, 10)));
  }
  const fileYears = fileName.match(/(?:^|[^0-9])(1[5-9]\d{2}|20[0-2]\d)(?:[^0-9]|$)/g);
  if (fileYears && fileYears.length > 0) {
    const parsedFileYears = fileYears
      .map((m) => Number.parseInt(m.replace(/\D/g, ''), 10))
      .filter((y) => y >= 1500 && y <= 2026);
    if (parsedFileYears.length > 0) {
      return Math.min(...parsedFileYears);
    }
  }
  const tsYear = Number.parseInt((uploadTimestamp ?? '').slice(0, 4), 10);
  return Number.isFinite(tsYear) && tsYear >= 1990 && tsYear <= 2026 ? tsYear : null;
}

export function parseWktPoint(wkt: string): {readonly lat: number; readonly lng: number} | null {
  const match = wkt.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) {
    return null;
  }
  const lng = Number.parseFloat(match[1]);
  const lat = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5))};
}

const CITY_TYPE_QIDS = new Set(['Q515', 'Q3957', 'Q1549591', 'Q532']);

export function detectRegionCategory(
  name: string,
  contextText: string,
  voivodeship: string,
  wikidataTypeQid?: string,
): RegionCategory {
  const text = `${name} ${contextText}`.toLowerCase();
  if (wikidataTypeQid && SEA_TYPE_QIDS.has(wikidataTypeQid)) return 'morze';
  if (wikidataTypeQid && MONUMENT_TYPE_QIDS.has(wikidataTypeQid)) return 'zabytek';
  if (wikidataTypeQid && MOUNTAIN_TYPE_QIDS.has(wikidataTypeQid)) return 'gory';
  if (wikidataTypeQid && WATER_TYPE_QIDS.has(wikidataTypeQid)) return 'nad_woda';
  if (/morze|bałtyk|plaża|molo|latarnia morska|półwysep|mierzeja|wybrzeże|zatoka gdańska/.test(text)) {
    return 'morze';
  }
  if ((voivodeship === 'Pomorskie' || voivodeship === 'Zachodniopomorskie') && /port morski|kąpielisko|nadmorsk/.test(text)) {
    return 'morze';
  }
  if (wikidataTypeQid && CITY_TYPE_QIDS.has(wikidataTypeQid)) {
    return 'miasto';
  }
  if (/zamek|pałac|kościół|katedra|bazylika|muzeum|twierdza|fort|skansen|ruiny|klasztor|ratusz|synagoga/.test(text)) {
    return 'zabytek';
  }
  if (/szczyt|góra|góry|tatry|beskid|bieszczad|karkonosz|sudet|pienin|przełęcz|schronisko|dolina|połonina/.test(text)) {
    return 'gory';
  }
  if (/jezioro|rzeka|zalew|wodospad|kanał|przystań|wyspa|mazur|pojezierze/.test(text)) {
    return 'nad_woda';
  }
  return 'miasto';
}

export function detectLocationDifficulty(sitelinks: number): LocationDifficulty {
  if (sitelinks >= 25) return 'easy';
  if (sitelinks >= 10) return 'medium';
  return 'hard';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSpoilerStems(name: string, voivodeship: string): readonly string[] {
  const tokens = `${name} ${voivodeship}`
    .split(/[\s\-–/,()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  const stems = new Set<string>();
  for (const token of tokens) {
    const stemLen = token.length >= 7 ? token.length - 2 : token.length - 1;
    stems.add(token.slice(0, Math.max(4, stemLen)));
  }
  return [...stems];
}

function stripParentheticalClutter(raw: string): string {
  let cleaned = raw;
  for (let pass = 0; pass < 3; pass += 1) {
    cleaned = cleaned.replace(/\([^()]*\)/g, ' ');
  }
  return cleaned
    .replace(/\([^)]*$/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCleanSentences(raw: string): readonly string[] {
  const cleaned = stripParentheticalClutter(raw);
  return cleaned
    .split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 24 &&
        !/\b(woj|pow|gm|ok|niem|kaszb|śl|cz|ukr|słow|łac|ros|lit|biał)\.$/i.test(s) &&
        !/^(niem|cz|śl|kaszb|łac)\./i.test(s),
    );
}

export function buildSpoilerFreeHint(
  extract: string,
  description: string,
  name: string,
  voivodeship: string,
  category: RegionCategory,
): string {
  const stems = extractSpoilerStems(name, voivodeship);
  const spoilerRegex = stems.length > 0 ? new RegExp(stems.map(escapeRegExp).join('|'), 'i') : null;
  const sentences = splitCleanSentences(`${extract} ${description}`);
  const safeSentence = sentences.find((sentence) => {
    if (spoilerRegex && spoilerRegex.test(sentence)) return false;
    return !/województw|powiecie|gminie|siedziba władz/i.test(sentence);
  });
  if (safeSentence) {
    return truncateClean(safeSentence, 480);
  }
  const cleanDesc = stripParentheticalClutter(description)
    .replace(/w województwie\s+[\p{L}-]+/giu, '')
    .replace(/w Polsce/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanDesc.length >= 24 && (!spoilerRegex || !spoilerRegex.test(cleanDesc))) {
    const capitalized = cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1);
    return truncateClean(capitalized.endsWith('.') ? capitalized : `${capitalized}.`, 480);
  }
  return CATEGORY_FALLBACK_HINTS[category];
}

export function cleanWikiFunFact(
  extract: string,
  description: string,
  name: string,
  voivodeship: string,
): string {
  const sentences = splitCleanSentences(extract);
  if (sentences.length > 0) {
    const combined = sentences.slice(0, 2).join(' ');
    return truncateClean(combined, 580);
  }
  const cleanDesc = stripParentheticalClutter(description);
  if (cleanDesc.length >= 16) {
    return truncateClean(`${name} — ${cleanDesc.replace(/\.$/, '')}.`, 580);
  }
  const locative = VOIVODESHIP_LOCATIVE[voivodeship] ?? voivodeship.toLowerCase();
  return truncateClean(`${name} to rozpoznawalna lokalizacja w województwie ${locative}.`, 580);
}

export function buildLocationTags(
  voivodeship: string,
  category: RegionCategory,
  contextText: string,
): readonly string[] {
  const lower = contextText.toLowerCase();
  const rawTags: string[] = [voivodeship, CATEGORY_TAG_LABEL[category]];
  if (/unesco/.test(lower)) rawTags.push('UNESCO');
  if (/uzdrowisk/.test(lower)) rawTags.push('uzdrowisko');
  if (/park narodow/.test(lower)) rawTags.push('park narodowy');
  if (/zamek|warowni|twierdz/.test(lower)) rawTags.push('warownia');
  if (/gotyck|renesans|barok/.test(lower)) rawTags.push('architektura');
  return normalizeLocationTags(rawTags);
}

const ImportedLocationSchema = z
  .object({
    id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
    name: z.string().min(1).max(120),
    voivodeship: z.string().min(1).max(60),
    lat: z.number(),
    lng: z.number(),
    imageUrl: z.string().min(1).max(500),
    hint: z.string().min(1).max(500),
    funFact: z.string().min(1).max(600),
    regionCategory: z.enum(['miasto', 'gory', 'morze', 'zabytek', 'nad_woda']),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    tags: z.array(z.string().min(1).max(32)).max(5).optional(),
    orderIndex: z.number().int().min(0).max(100000).optional(),
  })
  .refine((loc) => validateCoordinatesForCatalog('poland', loc.lat, loc.lng));

export function normalizeGeneratedLocationInput(raw: unknown): PolandLocation | null {
  const parsed = ImportedLocationSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const v = parsed.data;
  const canonicalVoiv = findVoivodeshipConfig(v.voivodeship)?.name ?? v.voivodeship.trim().slice(0, 60);
  return {
    id: v.id,
    catalogKey: 'poland',
    name: truncateClean(v.name, 120),
    voivodeship: canonicalVoiv,
    lat: Number(v.lat.toFixed(5)),
    lng: Number(v.lng.toFixed(5)),
    imageUrl: v.imageUrl.trim().slice(0, 500),
    hint: truncateClean(v.hint, 500),
    funFact: truncateClean(v.funFact, 600),
    regionCategory: v.regionCategory,
    isClassicOffline: false,
    orderIndex: v.orderIndex,
    countryCode: 'PL',
    difficulty: v.difficulty ?? 'medium',
    tags: normalizeLocationTags(v.tags ?? []),
    isActive: true,
  };
}
