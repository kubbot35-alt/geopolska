import type {CatalogKey, LocationDifficulty} from './types';

export interface CatalogDefinition {
  readonly key: CatalogKey;
  readonly label: string;
  readonly subtitle: string;
  readonly regionFieldLabel: string;
  readonly regionPlaceholder: string;
  readonly defaultCountryCode: string;
  readonly defaultLat: number;
  readonly defaultLng: number;
  readonly latMin: number;
  readonly latMax: number;
  readonly lngMin: number;
  readonly lngMax: number;
  readonly hasBundledSeed: boolean;
}

export const CATALOG_DEFINITIONS: Readonly<Record<CatalogKey, CatalogDefinition>> = {
  poland: {
    key: 'poland',
    label: 'Polska',
    subtitle: 'Aktywny katalog GeoPolska (16 województw)',
    regionFieldLabel: 'Województwo',
    regionPlaceholder: 'np. Mazowieckie',
    defaultCountryCode: 'PL',
    defaultLat: 52.2297,
    defaultLng: 21.0122,
    latMin: 48.5,
    latMax: 55.5,
    lngMin: 13.5,
    lngMax: 25.0,
    hasBundledSeed: true,
  },
  europe: {
    key: 'europe',
    label: 'Europa',
    subtitle: 'Katalog kontynentalny (przygotowanie wersji Europa)',
    regionFieldLabel: 'Region / Kraj',
    regionPlaceholder: 'np. Île-de-France / Toskania / Bawaria',
    defaultCountryCode: 'FR',
    defaultLat: 48.8566,
    defaultLng: 2.3522,
    latMin: 34.0,
    latMax: 72.0,
    lngMin: -25.0,
    lngMax: 45.0,
    hasBundledSeed: false,
  },
};

export const CATALOG_KEYS: readonly CatalogKey[] = ['poland', 'europe'];

export const LOCATION_DIFFICULTIES: readonly LocationDifficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_LABELS: Readonly<Record<LocationDifficulty, string>> = {
  easy: 'Łatwy',
  medium: 'Średni',
  hard: 'Trudny',
};

export interface CountryOption {
  readonly code: string;
  readonly name: string;
}

export const EUROPEAN_COUNTRIES: readonly CountryOption[] = [
  {code: 'PL', name: 'Polska'},
  {code: 'AT', name: 'Austria'},
  {code: 'BE', name: 'Belgia'},
  {code: 'BG', name: 'Bułgaria'},
  {code: 'CH', name: 'Szwajcaria'},
  {code: 'CZ', name: 'Czechy'},
  {code: 'DE', name: 'Niemcy'},
  {code: 'DK', name: 'Dania'},
  {code: 'EE', name: 'Estonia'},
  {code: 'ES', name: 'Hiszpania'},
  {code: 'FI', name: 'Finlandia'},
  {code: 'FR', name: 'Francja'},
  {code: 'GB', name: 'Wielka Brytania'},
  {code: 'GR', name: 'Grecja'},
  {code: 'HR', name: 'Chorwacja'},
  {code: 'HU', name: 'Węgry'},
  {code: 'IE', name: 'Irlandia'},
  {code: 'IS', name: 'Islandia'},
  {code: 'IT', name: 'Włochy'},
  {code: 'LT', name: 'Litwa'},
  {code: 'LV', name: 'Łotwa'},
  {code: 'NL', name: 'Holandia'},
  {code: 'NO', name: 'Norwegia'},
  {code: 'PT', name: 'Portugalia'},
  {code: 'RO', name: 'Rumunia'},
  {code: 'SE', name: 'Szwecja'},
  {code: 'SI', name: 'Słowenia'},
  {code: 'SK', name: 'Słowacja'},
  {code: 'UA', name: 'Ukraina'},
];

const COUNTRY_NAME_BY_CODE: Readonly<Record<string, string>> = Object.fromEntries(
  EUROPEAN_COUNTRIES.map((c) => [c.code, c.name]),
);

export function getCountryNameByCode(code?: string): string {
  if (!code) {
    return 'Polska';
  }
  const upper = code.toUpperCase();
  return COUNTRY_NAME_BY_CODE[upper] ?? upper;
}

export function validateCoordinatesForCatalog(
  catalogKey: CatalogKey,
  lat: number,
  lng: number,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  const def = CATALOG_DEFINITIONS[catalogKey];
  return lat >= def.latMin && lat <= def.latMax && lng >= def.lngMin && lng <= def.lngMax;
}

export function clampCoordinatesForCatalog(
  catalogKey: CatalogKey,
  lat: number,
  lng: number,
): {readonly lat: number; readonly lng: number} {
  const def = CATALOG_DEFINITIONS[catalogKey];
  const safeLat = Number.isFinite(lat) ? lat : def.defaultLat;
  const safeLng = Number.isFinite(lng) ? lng : def.defaultLng;
  return {
    lat: Math.max(def.latMin, Math.min(def.latMax, Number(safeLat.toFixed(5)))),
    lng: Math.max(def.lngMin, Math.min(def.lngMax, Number(safeLng.toFixed(5)))),
  };
}

export function normalizeCountryCode(raw: string | undefined, catalogKey: CatalogKey): string {
  if (catalogKey === 'poland') {
    return 'PL';
  }
  const cleaned = (raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  if (cleaned.length === 2) {
    return cleaned;
  }
  return CATALOG_DEFINITIONS[catalogKey].defaultCountryCode;
}

export function normalizeLocationTags(raw: string | readonly string[] | undefined): readonly string[] {
  if (!raw) {
    return [];
  }
  const parts = typeof raw === 'string' ? raw.split(/[,;#]/) : raw;
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const part of parts) {
    const clean = String(part).trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!clean) {
      continue;
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(clean);
    if (normalized.length >= 5) {
      break;
    }
  }

  return normalized;
}

export interface SchemaFieldRow {
  readonly field: string;
  readonly type: string;
  readonly required: 'Wymagane' | 'Opcjonalne';
  readonly constraints: string;
  readonly description: string;
}

export interface SchemaTableDefinition {
  readonly id: string;
  readonly title: string;
  readonly storage: 'Firestore' | 'IndexedDB';
  readonly path: string;
  readonly accessSummary: string;
  readonly fields: readonly SchemaFieldRow[];
}

export const DATABASE_SCHEMA_TABLES: readonly SchemaTableDefinition[] = [
  {
    id: 'locations',
    title: 'Kolekcja lokalizacji (Atlas Polska + Europa)',
    storage: 'Firestore',
    path: '/locations/{locationId}',
    accessSummary: 'Publiczny odczyt (filtr catalogKey), zapis/usuwanie wyłącznie dla zweryfikowanego admina.',
    fields: [
      {
        field: 'id',
        type: 'string',
        required: 'Wymagane',
        constraints: '1–128, ^[a-zA-Z0-9_-]+$, równe {locationId}',
        description: 'Kanoniczny slug dokumentu lokalizacji.',
      },
      {
        field: 'catalogKey',
        type: 'string',
        required: 'Wymagane',
        constraints: "enum: 'poland' | 'europe'",
        description: 'Klucz partycji katalogu używany w zapytaniach list i regułach granic WGS84.',
      },
      {
        field: 'name',
        type: 'string',
        required: 'Wymagane',
        constraints: '1–120 znaków',
        description: 'Nazwa wyświetlana miasta, szczytu lub zabytku.',
      },
      {
        field: 'voivodeship',
        type: 'string',
        required: 'Wymagane',
        constraints: '1–60 znaków',
        description: 'Województwo (Polska) lub region administracyjny / kraj (Europa).',
      },
      {
        field: 'lat / lng',
        type: 'number',
        required: 'Wymagane',
        constraints: 'PL: 48.5..55.5 / 13.5..25.0 · EU: 34.0..72.0 / -25.0..45.0',
        description: 'Współrzędne WGS84 walidowane warunkowo dla aktywnego katalogu.',
      },
      {
        field: 'imageUrl',
        type: 'string',
        required: 'Wymagane',
        constraints: '1–500 znaków',
        description: 'Lokalna ścieżka, proxy /api/location-photo/image lub URL HTTPS.',
      },
      {
        field: 'hint',
        type: 'string',
        required: 'Wymagane',
        constraints: '1–500 znaków',
        description: 'Podpowiedź geograficzna bez nazwy miejsca.',
      },
      {
        field: 'funFact',
        type: 'string',
        required: 'Wymagane',
        constraints: '1–600 znaków',
        description: 'Ciekawostka odkrywana po oddaniu strzału.',
      },
      {
        field: 'regionCategory',
        type: 'string',
        required: 'Wymagane',
        constraints: "'miasto' | 'gory' | 'morze' | 'zabytek' | 'nad_woda'",
        description: 'Kategoria filtrowania puli rozgrywki.',
      },
      {
        field: 'isClassicOffline',
        type: 'boolean',
        required: 'Wymagane',
        constraints: 'true | false',
        description: 'Oznaczenie lokacji w puli offline (Klasyczna 20).',
      },
      {
        field: 'orderIndex',
        type: 'integer',
        required: 'Wymagane',
        constraints: '0–100000',
        description: 'Deterministyczna kolejność dla spójnego losowania Daily Challenge.',
      },
      {
        field: 'countryCode',
        type: 'string',
        required: 'Opcjonalne',
        constraints: 'ISO-2, ^[A-Z]{2}$ (domyślnie PL)',
        description: 'Dwuliterowy kod państwa wg ISO 3166-1 alpha-2.',
      },
      {
        field: 'difficulty',
        type: 'string',
        required: 'Opcjonalne',
        constraints: "'easy' | 'medium' | 'hard' (domyślnie medium)",
        description: 'Poziom trudności rozpoznania lokalizacji.',
      },
      {
        field: 'tags',
        type: 'array<string>',
        required: 'Opcjonalne',
        constraints: 'maks. 5 elementów, każdy 1–32 znaki',
        description: 'Etykiety tematyczne (np. UNESCO, gotyk, uzdrowisko).',
      },
      {
        field: 'isActive',
        type: 'boolean',
        required: 'Opcjonalne',
        constraints: 'domyślnie true',
        description: 'Miękkie wyłączanie lokacji z losowań bez usuwania dokumentu.',
      },
      {
        field: 'createdAt / updatedAt',
        type: 'timestamp',
        required: 'Wymagane',
        constraints: 'serverTimestamp() == request.time',
        description: 'Znaczniki czasu serwera; createdAt jest niemutowalne.',
      },
    ],
  },
  {
    id: 'catalogMeta',
    title: 'Manifest wersji katalogu (1-odczytowy cache)',
    storage: 'Firestore',
    path: '/catalogMeta/{catalogId}',
    accessSummary: 'Publiczny get (poland, europe), brak list, zapis/aktualizacja tylko dla admina.',
    fields: [
      {
        field: 'id',
        type: 'string',
        required: 'Wymagane',
        constraints: '1–64, równe {catalogId} (poland | europe)',
        description: 'Identyfikator katalogu.',
      },
      {
        field: 'version',
        type: 'integer',
        required: 'Wymagane',
        constraints: '1–1000000',
        description: 'Monotoniczny numer rewizji unieważniający lokalny cache IndexedDB.',
      },
      {
        field: 'totalCount',
        type: 'integer',
        required: 'Wymagane',
        constraints: '0–100000',
        description: 'Liczba dokumentów w /locations dla danego catalogKey.',
      },
      {
        field: 'updatedBy',
        type: 'string',
        required: 'Wymagane',
        constraints: 'UID admina == request.auth.uid',
        description: 'Identyfikator administratora ostatniej modyfikacji.',
      },
      {
        field: 'createdAt / updatedAt',
        type: 'timestamp',
        required: 'Wymagane',
        constraints: 'serverTimestamp() == request.time',
        description: 'Znaczniki czasu utworzenia i ostatniej aktualizacji manifestu.',
      },
    ],
  },
  {
    id: 'indexedDbCache',
    title: 'Lokalna migawka offline (IndexedDB)',
    storage: 'IndexedDB',
    path: 'geopolska_locations_cache_db → catalog_snapshot',
    accessSummary: 'Pamięć lokalna przeglądarki izolowana per klucz katalogu (poland / europe).',
    fields: [
      {
        field: 'key (keyPath)',
        type: 'string',
        required: 'Wymagane',
        constraints: "'poland' | 'europe'",
        description: 'Klucz główny pozwalający przechowywać oba katalogi niezależnie.',
      },
      {
        field: 'version',
        type: 'integer',
        required: 'Wymagane',
        constraints: '>= 1',
        description: 'Ostatnia zsynchronizowana wersja z /catalogMeta/{key}.',
      },
      {
        field: 'updatedAtIso',
        type: 'string',
        required: 'Wymagane',
        constraints: 'ISO-8601',
        description: 'Czas lokalnego zapisu migawki.',
      },
      {
        field: 'locations',
        type: 'array<PolandLocation>',
        required: 'Wymagane',
        constraints: 'Walidowane schematem Zod przed zapisem i odczytem',
        description: 'Pełna lista lokalizacji wraz z nowymi polami (countryCode, difficulty, tags, isActive).',
      },
    ],
  },
];
