import rawCatalogData from '../data/polandLocationsCatalog.json';
import type {
  LocationPoolFilter,
  PolandLocation,
  RegionCategory,
} from './types';

type RawCatalogTuple8 = readonly [
  id: string,
  name: string,
  voivodeship: string,
  lat: number,
  lng: number,
  hint: string,
  funFact: string,
  categoryCode: string,
];

type RawCatalogTuple9 = readonly [
  id: string,
  name: string,
  voivodeship: string,
  lat: number,
  lng: number,
  imageUrl: string,
  hint: string,
  funFact: string,
  categoryCode: string,
];

type RawCatalogTuple = RawCatalogTuple8 | RawCatalogTuple9;

function decodeRegionCategory(code: string): RegionCategory {
  switch (code) {
    case 'g':
      return 'gory';
    case 's':
      return 'morze';
    case 'z':
      return 'zabytek';
    case 'w':
      return 'nad_woda';
    default:
      return 'miasto';
  }
}

function sanitizeHydratedHint(hint: string, category: RegionCategory): string {
  const trimmed = hint.trim();
  if (!trimmed || /\b(woj|pow|gm|ok)\.$/.test(trimmed) || trimmed.length < 24) {
    if (category === 'gory') {
      return 'Malownicza lokalizacja w pasmach górskich lub podgórskich południowej Polski.';
    }
    if (category === 'morze') {
      return 'Nadmorska miejscowość lub obiekt leżący w pasie polskiego wybrzeża Bałtyku.';
    }
    if (category === 'zabytek') {
      return 'Historyczny zabytek architektury z bogatą wielowiekową przeszłością.';
    }
    if (category === 'nad_woda') {
      return 'Malowniczy akwen lub miejscowość położona w krainie polskich jezior i rzek.';
    }
    return 'Charakterystyczna polska miejscowość o zabytkowej zabudowie miejskiej.';
  }
  return trimmed;
}

function isRawCatalogTuple(item: unknown): item is RawCatalogTuple {
  if (!Array.isArray(item)) {
    return false;
  }
  if (item.length === 8) {
    return (
      typeof item[0] === 'string' &&
      typeof item[1] === 'string' &&
      typeof item[2] === 'string' &&
      typeof item[3] === 'number' &&
      typeof item[4] === 'number' &&
      typeof item[5] === 'string' &&
      typeof item[6] === 'string' &&
      typeof item[7] === 'string'
    );
  }
  if (item.length === 9) {
    return (
      typeof item[0] === 'string' &&
      typeof item[1] === 'string' &&
      typeof item[2] === 'string' &&
      typeof item[3] === 'number' &&
      typeof item[4] === 'number' &&
      typeof item[5] === 'string' &&
      typeof item[6] === 'string' &&
      typeof item[7] === 'string' &&
      typeof item[8] === 'string'
    );
  }
  return false;
}

export function buildFreePhotoProxyUrl(
  name: string,
  voivodeship: string,
  lat: number,
  lng: number,
): string {
  const params = new URLSearchParams({
    name,
    voivodeship,
    lat: lat.toFixed(4),
    lng: lng.toFixed(4),
  });
  return `/api/location-photo/image?${params.toString()}`;
}

const POLISH_DIACRITICS: Readonly<Record<string, string>> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

/**
 * Generates a Firestore-rule-compliant location slug matching `^[a-zA-Z0-9_-]+$`.
 */
export function slugifyLocationId(rawName: string): string {
  const lowered = rawName
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => POLISH_DIACRITICS[ch] ?? ch);
  const slug = lowered
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || `loc-${Date.now()}`;
}

export function sortLocationsDeterministically(
  locations: readonly PolandLocation[],
): readonly PolandLocation[] {
  return [...locations].sort((a, b) => {
    const orderA = typeof a.orderIndex === 'number' ? a.orderIndex : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.orderIndex === 'number' ? b.orderIndex : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * 20 handcrafted local hero locations served from bundled local assets (100% offline-ready).
 */
export const FEATURED_OFFLINE_LOCATIONS: readonly PolandLocation[] = [
  {
    id: 'warszawa',
    name: 'Warszawa',
    voivodeship: 'Mazowieckie',
    lat: 52.2478,
    lng: 21.0138,
    imageUrl: '/src/assets/images/loc_warszawa_castle_square_1795108052565.jpg',
    hint: 'Stolica nad Wisłą z kolumną króla Zygmunta III Wazy przed Zamkiem Królewskim.',
    funFact: 'Stare Miasto zostało niemal w całości odbudowane po II wojnie światowej i w 1980 roku trafiło na listę UNESCO.',
    regionCategory: 'miasto',
  },
  {
    id: 'krakow',
    name: 'Kraków',
    voivodeship: 'Małopolskie',
    lat: 50.0617,
    lng: 19.9373,
    imageUrl: '/src/assets/images/loc_krakow_main_square_1795107949333.jpg',
    hint: 'Dawna siedziba polskich królów z Sukiennicami i asymetrycznymi wieżami bazyliki, z której co godzinę brzmi hejnał.',
    funFact: 'Rynek Główny o powierzchni 4 hektarów należy do największych średniowiecznych placów miejskich w Europie.',
    regionCategory: 'miasto',
  },
  {
    id: 'gdansk',
    name: 'Gdańsk',
    voivodeship: 'Pomorskie',
    lat: 54.3506,
    lng: 18.6575,
    imageUrl: '/src/assets/images/loc_gdansk_motlawa_crane_1795108110707.jpg',
    hint: 'Hanzeatycki port nad Motławą słynący z najstarszego zachowanego drewnianego dźwigu portowego w Europie.',
    funFact: 'XV-wieczny Żuraw mógł podnosić ładunki o masie do 4 ton dzięki napędowi złożonemu z dwóch par wielkich kół deptakowych.',
    regionCategory: 'morze',
  },
  {
    id: 'wroclaw',
    name: 'Wrocław',
    voivodeship: 'Dolnośląskie',
    lat: 51.1097,
    lng: 17.0322,
    imageUrl: '/src/assets/images/loc_wroclaw_market_square_1795107912930.jpg',
    hint: 'Miasto stu mostów nad Odrą, znane z późnogotyckiego ratusza i setek brązowych krasnali.',
    funFact: 'W piwnicach tutejszego ratusza działa Piwnica Świdnicka — jedna z najstarszych nieprzerwanie funkcjonujących restauracji w Europie (od 1273 r.).',
    regionCategory: 'miasto',
  },
  {
    id: 'poznan',
    name: 'Poznań',
    voivodeship: 'Wielkopolskie',
    lat: 52.4083,
    lng: 16.9335,
    imageUrl: '/src/assets/images/loc_poznan_old_market_1795107908549.jpg',
    hint: 'Wielkopolska metropolia nad Wartą z kolorowymi domkami budniczymi i trykającymi się koziołkami w samo południe.',
    funFact: 'Tutejszy renesansowy ratusz został przebudowany w XVI wieku przez włoskiego architekta Jana Baptystę di Quadro.',
    regionCategory: 'miasto',
  },
  {
    id: 'torun',
    name: 'Toruń',
    voivodeship: 'Kujawsko-Pomorskie',
    lat: 53.0085,
    lng: 18.6048,
    imageUrl: '/src/assets/images/loc_torun_vistula_panorama_1795108114232.jpg',
    hint: 'Miasto nad Wisłą słynące z aromatycznych pierników, czerwonego gotyku i narodzin Mikołaja Kopernika.',
    funFact: 'Średniowieczny układ urbanistyczny Starego i Nowego Miasta przetrwał bez wojennych zniszczeń i stanowi zabytek UNESCO.',
    regionCategory: 'zabytek',
  },
  {
    id: 'zakopane',
    name: 'Zakopane',
    voivodeship: 'Małopolskie',
    lat: 49.2992,
    lng: 19.9496,
    imageUrl: '/src/assets/images/loc_zakopane_giewont_tatras_1795107892467.jpg',
    hint: 'Zimowa stolica Polski u stóp Giewontu, z charakterystyczną drewnianą architekturą stylu podhalańskiego.',
    funFact: 'Styl architektoniczny tego miasta stworzył w latach 90. XIX wieku Stanisław Witkiewicz, inspirując się budownictwem górali podhalańskich.',
    regionCategory: 'gory',
  },
  {
    id: 'malbork',
    name: 'Malbork',
    voivodeship: 'Pomorskie',
    lat: 54.0397,
    lng: 19.0281,
    imageUrl: '/src/assets/images/loc_malbork_brick_castle_1795107904321.jpg',
    hint: 'Leży nad Nogatem i mieści największą ceglaną warownię gotycką na świecie, dawną siedzibę Zakonu Krzyżackiego.',
    funFact: 'Zespół zamkowy zajmuje ponad 21 hektarów powierzchni i zużyto do jego budowy około 4,5 miliona cegieł.',
    regionCategory: 'zabytek',
  },
  {
    id: 'zamosc',
    name: 'Zamość',
    voivodeship: 'Lubelskie',
    lat: 50.7167,
    lng: 23.2525,
    imageUrl: '/src/assets/images/loc_zamosc_renaissance_square_1795108112755.jpg',
    hint: 'Nazywany „Padwą Północy” — renesansowe miasto idealne z wachlarzowymi schodami ratusza i kamienicami ormiańskimi.',
    funFact: 'Miasto zaprojektował w 1580 roku włoski architekt Bernardo Morando na zlecenie kanclerza Jana Zamoyskiego.',
    regionCategory: 'zabytek',
  },
  {
    id: 'kazimierz-dolny',
    name: 'Kazimierz Dolny',
    voivodeship: 'Lubelskie',
    lat: 51.3208,
    lng: 21.9508,
    imageUrl: '/src/assets/images/loc_kazimierz_dolny_market_1795107883172.jpg',
    hint: 'Artystyczne miasteczko w Małopolskim Przełomie Wisły, znane ze studni na rynku, kamienic Przybyłów i lessowych wąwozów.',
    funFact: 'W XVI i XVII wieku było jednym z najważniejszych portów rzecznych, z których spławiano polskie zboże do Gdańska.',
    regionCategory: 'zabytek',
  },
  {
    id: 'sandomierz',
    name: 'Sandomierz',
    voivodeship: 'Świętokrzyskie',
    lat: 50.6801,
    lng: 21.7492,
    imageUrl: '/src/assets/images/loc_sandomierz_old_town_1795108198605.jpg',
    hint: 'Królewskie miasto na siedmiu wzgórzach nad Wisłą z pochyłym rynkiem, Bramą Opatowską i krzemieniem pasiastym.',
    funFact: 'Pod zabytkową starówką biegnie półkilometrowa podziemna trasa turystyczna utworzona w dawnych kupieckich lochach z XIV wieku.',
    regionCategory: 'zabytek',
  },
  {
    id: 'hel',
    name: 'Hel',
    voivodeship: 'Pomorskie',
    lat: 54.6081,
    lng: 18.8013,
    imageUrl: '/src/assets/images/loc_hel_baltic_peninsula_1795108117902.jpg',
    hint: 'Nadmorska miejscowość na samym krańcu 35-kilometrowej piaszczystej mierzei z ośmiokątną ceglaną latarnią morską.',
    funFact: 'Półwysep powstał w wyniku działania prądów morskich nanoszących piasek z zachodu i przez wieki był łańcuchem oddzielnych wysp.',
    regionCategory: 'morze',
  },
  {
    id: 'karpacz',
    name: 'Karpacz',
    voivodeship: 'Dolnośląskie',
    lat: 50.7775,
    lng: 15.7244,
    imageUrl: '/src/assets/images/loc_karpacz_wang_church_1795107902868.jpg',
    hint: 'Kurort w Karkonoszach u stóp Śnieżki, gdzie stoi przeniesiony z Norwegii XII-wieczny drewniany kościół klepkowy.',
    funFact: 'Świątynię Wang zbudowano z sosny norweskiej bez użycia ani jednego metalowego gwoździa i sprowadzono tu w 1842 roku.',
    regionCategory: 'gory',
  },
  {
    id: 'bialystok',
    name: 'Białystok',
    voivodeship: 'Podlaskie',
    lat: 53.1306,
    lng: 23.1651,
    imageUrl: '/src/assets/images/loc_bialystok_branicki_palace_1795107905527.jpg',
    hint: 'Stolica Podlasia z barokowym pałacem Branickich i francuskimi ogrodami zwanymi „Wersalem Północy”.',
    funFact: 'W tym mieście urodził się Ludwik Zamenhof — twórca międzynarodowego języka esperanto.',
    regionCategory: 'miasto',
  },
  {
    id: 'lodz',
    name: 'Łódź',
    voivodeship: 'Łódzkie',
    lat: 51.7805,
    lng: 19.4488,
    imageUrl: '/src/assets/images/loc_lodz_brick_factory_1795107884220.jpg',
    hint: 'Historyczna potęga przemysłu włókienniczego w centrum kraju, słynąca z monumentalnych ceglanych fabryk i ul. Piotrkowskiej.',
    funFact: 'W XIX wieku liczba mieszkańców wzrosła tu ponad pięćsetkrotnie w ciągu jednego stulecia — najszybciej w ówczesnej Europie.',
    regionCategory: 'miasto',
  },
  {
    id: 'szczecin',
    name: 'Szczecin',
    voivodeship: 'Zachodniopomorskie',
    lat: 53.4295,
    lng: 14.5653,
    imageUrl: '/src/assets/images/loc_szczecin_chrobry_embankment_1795107882037.jpg',
    hint: 'Portowe miasto u ujścia Odry z monumentalnym tarasem widokowym Wałów Chrobrego i gwiaździstym układem placów.',
    funFact: 'Układ urbanistyczny centrum miasta wzorowano na XIX-wiecznej przebudowie Paryża autorstwa barona Haussmanna.',
    regionCategory: 'nad_woda',
  },
  {
    id: 'olsztyn',
    name: 'Olsztyn',
    voivodeship: 'Warmińsko-Mazurskie',
    lat: 53.7764,
    lng: 20.4763,
    imageUrl: '/src/assets/images/loc_olsztyn_warmia_castle_1795107903787.jpg',
    hint: 'Stolica Warmii nad Łyną z gotyckim zamkiem kapituły, na którego murach Mikołaj Kopernik wykreślił tablicę astronomiczną.',
    funFact: 'W granicach administracyjnych miasta znajduje się aż 15 jezior, a ponad jedną piątą jego powierzchni zajmują lasy.',
    regionCategory: 'nad_woda',
  },
  {
    id: 'przemysl',
    name: 'Przemyśl',
    voivodeship: 'Podkarpackie',
    lat: 49.7824,
    lng: 22.7697,
    imageUrl: '/src/assets/images/loc_przemysl_hillside_market_1795107902198.jpg',
    hint: 'Jedno z najstarszych miast w południowo-wschodniej Polsce nad Sanem, z pochyłym rynkiem i dawną austro-węgierską twierdzą.',
    funFact: 'Twierdza wokół tego miasta była w czasie I wojny światowej trzecią co do wielkości fortyfikacją w Europie.',
    regionCategory: 'miasto',
  },
  {
    id: 'opole',
    name: 'Opole',
    voivodeship: 'Opolskie',
    lat: 50.6687,
    lng: 17.9212,
    imageUrl: '/src/assets/images/loc_opole_mlynowka_canal_1795107903541.jpg',
    hint: 'Stolica polskiej piosenki nad Odrą, gdzie nad kanałem Młynówka ciągnie się malownicza zabudowa zwana miejscową Wenecją.',
    funFact: 'Od 1963 roku w tutejszym amfiteatrze odbywa się Krajowy Festiwal Polskiej Piosenki.',
    regionCategory: 'nad_woda',
  },
  {
    id: 'katowice',
    name: 'Katowice',
    voivodeship: 'Śląskie',
    lat: 50.2435,
    lng: 19.0827,
    imageUrl: '/src/assets/images/loc_katowice_nikiszowiec_1795108200659.jpg',
    hint: 'Serce Górnego Śląska z unikatowym osiedlem robotniczym Nikiszowiec o ceglanych familokach i czerwonych wnękach okiennych.',
    funFact: 'Nikiszowiec zaprojektowali na początku XX wieku bracia Emil i Georg Zillmannowie jako samowystarczalne miasteczko górnicze.',
    regionCategory: 'miasto',
  },
] as const;

const RAW_CATALOG_BOUNDARY: unknown = rawCatalogData;

const INDEXED_FEATURED_LOCATIONS: readonly PolandLocation[] = FEATURED_OFFLINE_LOCATIONS.map(
  (loc, index) => ({
    ...loc,
    catalogKey: 'poland' as const,
    countryCode: 'PL',
    difficulty: 'easy' as const,
    tags: [],
    isActive: true,
    isClassicOffline: true,
    orderIndex: index,
  }),
);

const HYDRATED_CATALOG_LOCATIONS: readonly PolandLocation[] = Array.isArray(RAW_CATALOG_BOUNDARY)
  ? RAW_CATALOG_BOUNDARY.filter(isRawCatalogTuple).map((tuple, index): PolandLocation => {
      const orderIndex = INDEXED_FEATURED_LOCATIONS.length + index;
      if (tuple.length === 8) {
        const category = decodeRegionCategory(tuple[7]);
        return {
          id: tuple[0],
          name: tuple[1],
          voivodeship: tuple[2],
          lat: tuple[3],
          lng: tuple[4],
          imageUrl: buildFreePhotoProxyUrl(tuple[1], tuple[2], tuple[3], tuple[4]),
          hint: sanitizeHydratedHint(tuple[5], category),
          funFact: tuple[6],
          regionCategory: category,
          isClassicOffline: false,
          orderIndex,
          catalogKey: 'poland',
          countryCode: 'PL',
          difficulty: 'medium',
          tags: [],
          isActive: true,
        };
      }
      const category = decodeRegionCategory(tuple[8]);
      return {
        id: tuple[0],
        name: tuple[1],
        voivodeship: tuple[2],
        lat: tuple[3],
        lng: tuple[4],
        imageUrl: tuple[5],
        hint: sanitizeHydratedHint(tuple[6], category),
        funFact: tuple[7],
        regionCategory: category,
        isClassicOffline: false,
        orderIndex,
        catalogKey: 'poland',
        countryCode: 'PL',
        difficulty: 'medium',
        tags: [],
        isActive: true,
      };
    })
  : [];

/**
 * Full bundled seed GeoPolska Atlas combining 20 locally bundled hero scenes
 * with 1,080 verified Polish cities, castles, palaces, mountain peaks, lakes, and coastal landmarks (1,100 total).
 * Used as the initial seed for Firebase migration and offline fallback.
 */
export const POLAND_LOCATIONS: readonly PolandLocation[] = [
  ...INDEXED_FEATURED_LOCATIONS,
  ...HYDRATED_CATALOG_LOCATIONS,
];

export interface LocationPoolOption {
  readonly id: LocationPoolFilter;
  readonly label: string;
  readonly count: number;
}

export function getLocationsForPool(
  filter: LocationPoolFilter,
  isOnline = true,
  catalog: readonly PolandLocation[] = POLAND_LOCATIONS,
): readonly PolandLocation[] {
  const rawSource = catalog.length > 0 ? catalog : POLAND_LOCATIONS;
  const activeOnly = rawSource.filter((loc) => loc.isActive !== false);
  const source = activeOnly.length > 0 ? activeOnly : rawSource;
  if (!isOnline || filter === 'classic_20') {
    const classic = source.filter((loc) => loc.isClassicOffline === true);
    return classic.length > 0 ? classic : INDEXED_FEATURED_LOCATIONS;
  }
  switch (filter) {
    case 'miasto':
      return source.filter((loc) => loc.regionCategory === 'miasto');
    case 'zabytek':
      return source.filter((loc) => loc.regionCategory === 'zabytek');
    case 'gory':
      return source.filter((loc) => loc.regionCategory === 'gory');
    case 'woda_morze':
      return source.filter(
        (loc) => loc.regionCategory === 'morze' || loc.regionCategory === 'nad_woda',
      );
    case 'all':
    default:
      return source;
  }
}

export function buildLocationPoolOptions(
  catalog: readonly PolandLocation[] = POLAND_LOCATIONS,
): readonly LocationPoolOption[] {
  const source = catalog.length > 0 ? catalog : POLAND_LOCATIONS;
  return [
    {id: 'all', label: 'Cała Polska', count: source.length},
    {id: 'miasto', label: 'Miasta', count: getLocationsForPool('miasto', true, source).length},
    {id: 'zabytek', label: 'Zamki i zabytki', count: getLocationsForPool('zabytek', true, source).length},
    {id: 'gory', label: 'Góry', count: getLocationsForPool('gory', true, source).length},
    {id: 'woda_morze', label: 'Morze i jeziora', count: getLocationsForPool('woda_morze', true, source).length},
    {
      id: 'classic_20',
      label: 'Klasyczna 20 (offline)',
      count: getLocationsForPool('classic_20', true, source).length,
    },
  ];
}

export const LOCATION_POOL_OPTIONS: readonly LocationPoolOption[] =
  buildLocationPoolOptions(POLAND_LOCATIONS);

export const POLISH_VOIVODESHIPS: readonly string[] = [
  'Dolnośląskie',
  'Kujawsko-Pomorskie',
  'Lubelskie',
  'Lubuskie',
  'Łódzkie',
  'Małopolskie',
  'Mazowieckie',
  'Opolskie',
  'Podkarpackie',
  'Podlaskie',
  'Pomorskie',
  'Śląskie',
  'Świętokrzyskie',
  'Warmińsko-Mazurskie',
  'Wielkopolskie',
  'Zachodniopomorskie',
];
