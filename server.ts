import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {GoogleGenAI, ThinkingLevel, Type} from '@google/genai';
import {z} from 'zod';

const FREE_GEMINI_MODEL = 'gemini-4-hydrogen';
const VIDEO_OMNI_MODEL = 'gemini-omni-1.2-flash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SearchFactsSchema = z.object({
  locationName: z.string().min(1).max(100),
  voivodeship: z.string().min(1).max(100),
});

const MapsNearbySchema = z.object({
  locationName: z.string().min(1).max(100),
  lat: z.number().min(48).max(56),
  lng: z.number().min(13).max(25),
});

const DeepAnalysisSchema = z.object({
  locationName: z.string().min(1).max(100),
  voivodeship: z.string().min(1).max(100),
  distanceKm: z.number().min(0).max(2500),
  hint: z.string().min(1).max(300),
  funFact: z.string().min(1).max(400),
});

const ChallengeCandidateSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  voivodeship: z.string().min(1).max(80),
  regionCategory: z.enum(['miasto', 'gory', 'morze', 'zabytek', 'nad_woda']),
});

const ThemedChallengeSchema = z.object({
  themePrompt: z.string().min(3).max(320),
  region: z.string().min(2).max(80),
  roundCount: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  candidates: z.array(ChallengeCandidateSchema).min(3).max(60),
});

const GeneratedChallengeJsonSchema = z.object({
  title: z.string().min(2).max(120),
  briefing: z.string().min(10).max(400),
  stops: z.array(
    z.object({
      locationId: z.string().min(1),
      customClue: z.string().max(260),
    }),
  ),
});

const AnimateVideoSchema = z.object({
  imageBase64: z.string().min(100).max(12_000_000).optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  locationImageUrl: z.string().min(4).max(800).optional(),
  locationName: z.string().max(120).optional(),
  prompt: z.string().min(3).max(500),
  aspectRatio: z.enum(['16:9', '9:16']),
});

interface GroundingSource {
  readonly title: string;
  readonly uri: string;
  readonly snippet?: string;
}

function classifyGeminiError(
  err: unknown,
  isVideoEndpoint = false,
): {status: number; message: string; code: string} {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      code: isVideoEndpoint ? 'VIDEO_QUOTA_OR_BILLING' : 'FREE_TIER_RATE_LIMIT',
      message: isVideoEndpoint
        ? 'Przekroczono limit zapytań lub wymagany jest aktywny klucz API z włączonym rozliczaniem dla modelu wideo Gemini Omni.'
        : 'Osiągnięto chwilowy limit zapytań darmowego API Google Gemini. Odczekaj kilkanaście sekund i spróbuj ponownie.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403')) {
    return {
      status: 403,
      code: 'API_KEY_ERROR',
      message: isVideoEndpoint
        ? 'Obecny klucz GEMINI_API_KEY nie ma uprawnień do generowania wideo w modelu gemini-omni-1.2-flash.'
        : 'Brak uprawnień klucza Google Gemini API. Sprawdź konfigurację GEMINI_API_KEY.',
    };
  }
  return {
    status: 500,
    code: 'GEMINI_UPSTREAM_ERROR',
    message: isVideoEndpoint
      ? 'Nie udało się wygenerować animacji wideo przez Gemini Interactions API. Spróbuj ponownie za chwilę.'
      : 'Nie udało się uzyskać odpowiedzi z darmowego Google Gemini API. Spróbuj ponownie za chwilę.',
  };
}

function inferImageMimeType(filePathOrUrl: string, contentTypeHeader?: string | null): 'image/jpeg' | 'image/png' | 'image/webp' {
  const header = (contentTypeHeader ?? '').toLowerCase();
  if (header.includes('png')) return 'image/png';
  if (header.includes('webp')) return 'image/webp';
  if (header.includes('jpeg') || header.includes('jpg')) return 'image/jpeg';

  const lower = filePathOrUrl.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

const WIKI_USER_AGENT = 'GeoPolska-Atlas/1.0 (https://geopolska.app; educational geography game)';
const photoUrlCache = new Map<string, string | null>();

function isBlockedIllustrationUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.endsWith('.svg') ||
    lower.includes('.svg.png') ||
    lower.includes('herb_') ||
    lower.includes('coa_') ||
    lower.includes('flag_') ||
    lower.includes('flaga_') ||
    lower.includes('location_map') ||
    lower.includes('mapa_') ||
    lower.includes('map_of_') ||
    lower.includes('poland_') ||
    lower.includes('locator')
  );
}

async function fetchWikiSummaryPhotoUrl(title: string): Promise<string | null> {
  try {
    const endpoint = `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
    const resp = await fetch(endpoint, {
      headers: {'User-Agent': WIKI_USER_AGENT, Accept: 'application/json'},
    });
    if (!resp.ok) {
      return null;
    }
    const raw: unknown = await resp.json();
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const record = raw as {
      thumbnail?: {source?: string};
      originalimage?: {source?: string};
    };
    const thumb = record.thumbnail?.source;
    const orig = record.originalimage?.source;
    const candidate = thumb ?? orig ?? null;
    if (!candidate || isBlockedIllustrationUrl(candidate)) {
      return null;
    }
    // Request a crisp 1280px wide version when Wikimedia thumbnail URL has /NNNpx-
    return candidate.replace(/\/\d+px-/, '/1280px-');
  } catch {
    return null;
  }
}

async function fetchWikiGeoPhotoUrl(lat: number, lng: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'geosearch',
      ggscoord: `${lat.toFixed(5)}|${lng.toFixed(5)}`,
      ggsradius: '3500',
      ggslimit: '8',
      prop: 'pageimages',
      pithumbsize: '1280',
      format: 'json',
      origin: '*',
    });
    const resp = await fetch(`https://pl.wikipedia.org/w/api.php?${params.toString()}`, {
      headers: {'User-Agent': WIKI_USER_AGENT, Accept: 'application/json'},
    });
    if (!resp.ok) {
      return null;
    }
    const raw: unknown = await resp.json();
    if (typeof raw !== 'object' || raw === null || !('query' in raw)) {
      return null;
    }
    const pages = (raw as {query?: {pages?: Record<string, {thumbnail?: {source?: string}}>}}).query?.pages;
    if (!pages) {
      return null;
    }
    for (const page of Object.values(pages)) {
      const src = page.thumbnail?.source;
      if (src && !isBlockedIllustrationUrl(src)) {
        return src;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveFreeLocationPhotoUrl(
  name: string,
  voivodeship: string,
  lat: number,
  lng: number,
): Promise<string | null> {
  const cacheKey = `${name.toLowerCase()}|${voivodeship.toLowerCase()}|${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (photoUrlCache.has(cacheKey)) {
    return photoUrlCache.get(cacheKey) ?? null;
  }

  let resolved = await fetchWikiSummaryPhotoUrl(name);
  if (!resolved && voivodeship) {
    resolved = await fetchWikiSummaryPhotoUrl(`${name} (województwo ${voivodeship.toLowerCase()})`);
  }
  if (!resolved && Number.isFinite(lat) && Number.isFinite(lng)) {
    resolved = await fetchWikiGeoPhotoUrl(lat, lng);
  }

  if (photoUrlCache.size > 2000) {
    photoUrlCache.clear();
  }
  photoUrlCache.set(cacheKey, resolved);
  return resolved;
}

async function resolveImageToBase64(input: {
  imageBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  locationImageUrl?: string;
}): Promise<{base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'} | {error: string; status: number}> {
  if (input.imageBase64) {
    const cleaned = input.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    return {
      base64: cleaned,
      mimeType: input.mimeType ?? 'image/jpeg',
    };
  }

  if (!input.locationImageUrl) {
    return {error: 'Prześlij zdjęcie lub wybierz kadr z lokalizacji w Polsce.', status: 400};
  }

  const rawUrl = input.locationImageUrl.trim();

  // Case A0: Our own free Wikimedia photo proxy URL (/api/location-photo/image?...)
  if (rawUrl.startsWith('/api/location-photo/image')) {
    const parsedProxy = new URL(rawUrl, 'http://localhost');
    const name = parsedProxy.searchParams.get('name') ?? '';
    const voivodeship = parsedProxy.searchParams.get('voivodeship') ?? '';
    const lat = Number(parsedProxy.searchParams.get('lat') ?? '52');
    const lng = Number(parsedProxy.searchParams.get('lng') ?? '19');
    const wikiUrl = await resolveFreeLocationPhotoUrl(name, voivodeship, lat, lng);
    if (!wikiUrl) {
      return {error: 'Nie udało się pobrać zdjęcia źródłowego dla tej lokalizacji.', status: 404};
    }
    const upstream = await fetch(wikiUrl, {
      headers: {'User-Agent': WIKI_USER_AGENT, Accept: 'image/*'},
    });
    if (!upstream.ok) {
      return {error: `Nie udało się pobrać zdjęcia źródłowego (HTTP ${upstream.status}).`, status: 502};
    }
    const arrayBuffer = await upstream.arrayBuffer();
    return {
      base64: Buffer.from(arrayBuffer).toString('base64'),
      mimeType: inferImageMimeType(wikiUrl, upstream.headers.get('content-type')),
    };
  }

  // Case A: Local bundled Vite asset (e.g. /src/assets/images/krakow.jpg or /assets/krakow-xxx.jpg)
  if (rawUrl.startsWith('/')) {
    const cleanRel = rawUrl.split('?')[0].replace(/^\/+/, '');
    const candidates = [
      path.resolve(__dirname, cleanRel),
      path.resolve(__dirname, 'dist', cleanRel),
      path.resolve(__dirname, 'public', cleanRel),
    ];
    for (const candidatePath of candidates) {
      const withinProject = candidatePath.startsWith(__dirname + path.sep);
      if (withinProject && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        const buffer = fs.readFileSync(candidatePath);
        return {
          base64: buffer.toString('base64'),
          mimeType: inferImageMimeType(candidatePath),
        };
      }
    }
    return {error: 'Nie odnaleziono lokalnego pliku zdjęcia na serwerze.', status: 404};
  }

  // Case B: Verified remote photo URL (Wikimedia Commons / Wikipedia)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return {error: 'Nieprawidłowy adres URL zdjęcia.', status: 400};
  }

  const allowedHosts = new Set([
    'upload.wikimedia.org',
    'commons.wikimedia.org',
    'images.unsplash.com',
  ]);
  if (parsedUrl.protocol !== 'https:' || !allowedHosts.has(parsedUrl.hostname)) {
    return {error: 'Dozwolone są wyłącznie lokalne kadry gry, pliki użytkownika oraz zdjęcia Wikimedia.', status: 400};
  }

  const upstream = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent': WIKI_USER_AGENT,
      Accept: 'image/*',
    },
  });
  if (!upstream.ok) {
    return {error: `Nie udało się pobrać zdjęcia źródłowego (HTTP ${upstream.status}).`, status: 502};
  }
  const arrayBuffer = await upstream.arrayBuffer();
  if (arrayBuffer.byteLength > 9 * 1024 * 1024) {
    return {error: 'Zdjęcie źródłowe przekracza limit 9 MB.', status: 413};
  }
  return {
    base64: Buffer.from(arrayBuffer).toString('base64'),
    mimeType: inferImageMimeType(parsedUrl.pathname, upstream.headers.get('content-type')),
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({limit: '15mb'}));

  app.get('/api/config/public', (_req: Request, res: Response) => {
    res.json({
      mapProvider: 'openstreetmap-free',
    });
  });

  // Free Wikimedia / Polish Wikipedia photograph proxy for all 1,080 catalog locations
  app.get('/api/location-photo/image', async (req: Request, res: Response) => {
    const name = typeof req.query.name === 'string' ? req.query.name.trim().slice(0, 120) : '';
    const voivodeship =
      typeof req.query.voivodeship === 'string' ? req.query.voivodeship.trim().slice(0, 80) : '';
    const lat = Number(req.query.lat ?? '52');
    const lng = Number(req.query.lng ?? '19');

    if (!name) {
      res.status(400).send('Missing location name');
      return;
    }

    try {
      const photoUrl = await resolveFreeLocationPhotoUrl(name, voivodeship, lat, lng);
      if (!photoUrl) {
        res.status(404).send('Photo not found');
        return;
      }

      const upstream = await fetch(photoUrl, {
        headers: {'User-Agent': WIKI_USER_AGENT, Accept: 'image/*'},
      });
      if (!upstream.ok) {
        res.status(404).send('Upstream image unavailable');
        return;
      }

      const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch {
      res.status(502).send('Photo proxy error');
    }
  });

  // 1. Google Search Grounding (gemini-4-hydrogen)
  app.post('/api/ai/search-facts', async (req: Request, res: Response) => {
    const parsed = SearchFactsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Nieprawidłowe dane lokalizacji.'});
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({error: 'Klucz GEMINI_API_KEY nie jest skonfigurowany na serwerze.'});
      return;
    }

    try {
      const {locationName, voivodeship} = parsed.data;
      const response = await ai.models.generateContent({
        model: FREE_GEMINI_MODEL,
        contents: `Podaj po polsku zwięzłe, zweryfikowane ciekawostki kulturowe, historyczne i architektoniczne o miejscu: ${locationName} (województwo ${voivodeship}, Polska). Sformatuj jako 3 krótkie punkty z konkretami, bez zbędnego wstępu.`,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: GroundingSource[] = [];
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title ?? chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
      }

      res.json({
        markdown: response.text ?? 'Brak dodatkowych informacji.',
        sources,
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({error: classified.message, code: classified.code});
    }
  });

  // 2. Google Maps Grounding (gemini-4-hydrogen with googleMaps tool)
  app.post('/api/ai/maps-nearby', async (req: Request, res: Response) => {
    const parsed = MapsNearbySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Nieprawidłowe współrzędne lokalizacji.'});
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({error: 'Klucz GEMINI_API_KEY nie jest skonfigurowany na serwerze.'});
      return;
    }

    try {
      const {locationName, lat, lng} = parsed.data;
      const response = await ai.models.generateContent({
        model: FREE_GEMINI_MODEL,
        contents: `Wskaż po polsku 4 najciekawsze zabytki, punkty widokowe lub atrakcje turystyczne w bezpośrednim pobliżu miejsca ${locationName} w Polsce. Podaj krótkie opisy każdego miejsca.`,
        config: {
          tools: [{googleMaps: {}}],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng,
              },
            },
          },
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const places: GroundingSource[] = [];
      for (const chunk of chunks) {
        const mapsData = chunk.maps;
        if (mapsData?.uri) {
          const rawSnippet: unknown = mapsData.placeAnswerSources?.reviewSnippets?.[0];
          let firstSnippet: string | undefined;
          if (typeof rawSnippet === 'object' && rawSnippet !== null) {
            const record = rawSnippet as Record<string, unknown>;
            if (typeof record.reviewText === 'string') {
              firstSnippet = record.reviewText;
            } else if (typeof record.text === 'string') {
              firstSnippet = record.text;
            } else if (typeof record.title === 'string') {
              firstSnippet = record.title;
            }
          }
          places.push({
            title: mapsData.title ?? 'Punkt na Google Maps',
            uri: mapsData.uri,
            ...(firstSnippet ? {snippet: firstSnippet} : {}),
          });
        }
      }

      res.json({
        markdown: response.text ?? 'Brak danych o pobliskich miejscach.',
        places,
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({error: classified.message, code: classified.code});
    }
  });

  // 3. Free-Tier Geographical Detective (gemini-4-hydrogen, ThinkingLevel.MEDIUM)
  app.post('/api/ai/deep-analysis', async (req: Request, res: Response) => {
    const parsed = DeepAnalysisSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Nieprawidłowe dane do analizy.'});
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({error: 'Klucz GEMINI_API_KEY nie jest skonfigurowany na serwerze.'});
      return;
    }

    try {
      const {locationName, voivodeship, distanceKm, hint, funFact} = parsed.data;
      const response = await ai.models.generateContent({
        model: FREE_GEMINI_MODEL,
        contents: `Jesteś ekspertem od geografii Polski i gry GeoGuessr. Gracz właśnie odgadł lokalizację: ${locationName} (woj. ${voivodeship}) z błędem ${distanceKm.toFixed(1)} km. Wskazówka rundy: "${hint}". Ciekawostka: "${funFact}".
Przeanalizuj po polsku i wypunktuj 4 konkretne cechy wizualne, architektoniczne, urbanistyczne lub krajobrazowe (np. styl cegły, układ rynku, ukształtowanie terenu, roślinność, rzeka), po których mistrz GeoGuessr rozpoznałby ${locationName} na pierwszy rzut oka. Dodaj 1 krótkie zdanie oceny wyniku gracza.`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },
        },
      });

      res.json({
        markdown: response.text ?? 'Analiza niedostępna.',
        model: `${FREE_GEMINI_MODEL} (Free API)`,
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({error: classified.message, code: classified.code});
    }
  });

  // 4. Free-Tier Themed Challenge Curator (gemini-4-hydrogen + structured JSON responseSchema)
  app.post('/api/ai/themed-challenge', async (req: Request, res: Response) => {
    const parsed = ThemedChallengeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Podaj temat wyprawy (min. 3 znaki), region i liczbę rund (3, 5 lub 10).'});
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({error: 'Klucz GEMINI_API_KEY nie jest skonfigurowany na serwerze.'});
      return;
    }

    try {
      const {themePrompt, region, roundCount, candidates} = parsed.data;
      const validIds = new Set(candidates.map((c) => c.id));
      const candidateLines = candidates
        .map((c) => `${c.id} | ${c.name} | woj. ${c.voivodeship} | ${c.regionCategory}`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: FREE_GEMINI_MODEL,
        contents: `Jesteś kuratorem tras geograficznych dla polskiej gry GeoPolska.
Temat wyzwania gracza: "${themePrompt}"
Preferowany region: "${region}"
Liczba przystanków do wybrania: ${roundCount}

Poniżej znajduje się lista zweryfikowanych miejsc w Polsce (format: id | nazwa | województwo | kategoria):
${candidateLines}

Zadanie:
1. Wybierz DOKŁADNIE ${roundCount} unikalnych identyfikatorów (id) z powyższej listy, które najlepiej pasują do tematu gracza.
2. Nadaj wyprawie klimatyczny polski tytuł (maks. 60 znaków).
3. Napisz zwięzły, 1-2 zdaniowy opis trasy (briefing) bez zdradzania nazw wybranych miejscowości.
4. Dla każdego wybranego miejsca napisz 1-zdaniową wskazówkę detektywistyczną (customClue) po polsku (bez użycia nazwy miejscowości ani jej odmiany!), która pomoże graczowi po odblokowaniu Podpowiedzi 2.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {type: Type.STRING},
              briefing: {type: Type.STRING},
              stops: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    locationId: {type: Type.STRING},
                    customClue: {type: Type.STRING},
                  },
                  required: ['locationId', 'customClue'],
                },
              },
            },
            required: ['title', 'briefing', 'stops'],
          },
        },
      });

      const rawText = response.text ?? '{}';
      const parsedJson: unknown = JSON.parse(rawText);
      const validated = GeneratedChallengeJsonSchema.safeParse(parsedJson);
      if (!validated.success) {
        res.status(502).json({error: 'Model zwrócił niepełną strukturę trasy. Spróbuj ponownie.'});
        return;
      }

      const uniqueStops: {locationId: string; customClue: string}[] = [];
      const picked = new Set<string>();
      for (const stop of validated.data.stops) {
        if (validIds.has(stop.locationId) && !picked.has(stop.locationId)) {
          picked.add(stop.locationId);
          uniqueStops.push(stop);
          if (uniqueStops.length >= roundCount) {
            break;
          }
        }
      }

      // Deterministic top-up if the model returned fewer distinct valid IDs than requested
      for (const candidate of candidates) {
        if (uniqueStops.length >= roundCount) {
          break;
        }
        if (!picked.has(candidate.id)) {
          picked.add(candidate.id);
          uniqueStops.push({locationId: candidate.id, customClue: ''});
        }
      }

      res.json({
        title: validated.data.title.trim(),
        briefing: validated.data.briefing.trim(),
        stops: uniqueStops,
        model: `${FREE_GEMINI_MODEL} (Free API)`,
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({error: classified.message, code: classified.code});
    }
  });

  // 5. Image-to-Video Animation Studio (Gemini Interactions API: gemini-omni-1.2-flash, 16:9 & 9:16)
  app.post('/api/ai/animate-video', async (req: Request, res: Response) => {
    const parsed = AnimateVideoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Podaj poprawny obraz (plik lub kadr z gry), opis ruchu (min. 3 znaki) oraz proporcje 16:9 lub 9:16.',
      });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({error: 'Klucz GEMINI_API_KEY nie jest skonfigurowany na serwerze.'});
      return;
    }

    const resolvedImage = await resolveImageToBase64(parsed.data);
    if ('error' in resolvedImage) {
      res.status(resolvedImage.status).json({error: resolvedImage.error});
      return;
    }

    try {
      const {prompt, aspectRatio, locationName} = parsed.data;
      const contextualPrompt = locationName
        ? `Cinematic smooth camera animation of ${locationName} in Poland: ${prompt}. Natural motion, atmospheric light, faithful to the original architecture and landscape.`
        : `Cinematic smooth animation based on the provided photograph: ${prompt}. Natural motion, atmospheric light, faithful to the original scene.`;

      const interaction = await ai.interactions.create(
        {
          model: VIDEO_OMNI_MODEL,
          input: [
            {
              type: 'image',
              mime_type: resolvedImage.mimeType,
              data: resolvedImage.base64,
            },
            {
              type: 'text',
              text: contextualPrompt,
            },
          ],
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
          },
        },
        {timeout: 300000},
      );

      const rawInteraction = interaction as unknown as {
        output_video?: {data?: string; uri?: string; mime_type?: string};
        outputs?: Array<{type?: string; data?: string; uri?: string; mime_type?: string}>;
      };

      const videoPart =
        rawInteraction.output_video ??
        rawInteraction.outputs?.find((item) => item.type === 'video');

      if (videoPart?.data) {
        const mimeType = videoPart.mime_type ?? 'video/mp4';
        res.json({
          videoDataUrl: `data:${mimeType};base64,${videoPart.data}`,
          mimeType,
          aspectRatio,
          model: VIDEO_OMNI_MODEL,
        });
        return;
      }

      if (videoPart?.uri) {
        const mimeType = videoPart.mime_type ?? 'video/mp4';
        res.json({
          videoDataUrl: videoPart.uri,
          mimeType,
          aspectRatio,
          model: VIDEO_OMNI_MODEL,
        });
        return;
      }

      res.status(502).json({
        error: 'Model Gemini Omni nie zwrócił strumienia wideo dla tego kadru. Spróbuj innego opisu ruchu.',
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err, true);
      res.status(classified.status).json({error: classified.message, code: classified.code});
    }
  });

  if (!IS_PROD) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build artifacts not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GeoPolska server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
