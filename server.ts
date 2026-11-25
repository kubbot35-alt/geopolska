import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import {GoogleGenAI, ThinkingLevel} from '@google/genai';
import {z} from 'zod';
import {generateVoivodeshipLocations} from './src/infrastructure/generator/polandGeneratorBackend';

const FREE_GEMINI_MODEL = 'gemini-4-hydrogen';

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

const DeepAnalysisSchema = z.object({
  locationName: z.string().min(1).max(100),
  voivodeship: z.string().min(1).max(100),
  distanceKm: z.number().min(0).max(2500),
  hint: z.string().min(1).max(300),
  funFact: z.string().min(1).max(400),
});

const VoivodeshipGeneratorSchema = z.object({
  voivodeship: z.string().min(2).max(60),
  limit: z.number().int().min(10).max(120).default(70),
  excludeNames: z.array(z.string().min(1).max(120)).max(2500).default([]),
  photoFreshness: z.enum(['only_2025_2026', 'prefer_2025_2026', 'any']).default('only_2025_2026'),
});

interface GroundingSource {
  readonly title: string;
  readonly uri: string;
  readonly snippet?: string;
}

function classifyGeminiError(err: unknown): {status: number; message: string; code: string} {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      code: 'FREE_TIER_RATE_LIMIT',
      message:
        'Osiągnięto chwilowy limit zapytań darmowego API Google Gemini. Odczekaj kilkanaście sekund i spróbuj ponownie.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403')) {
    return {
      status: 403,
      code: 'API_KEY_ERROR',
      message: 'Brak uprawnień klucza Google Gemini API. Sprawdź konfigurację GEMINI_API_KEY.',
    };
  }
  return {
    status: 500,
    code: 'GEMINI_UPSTREAM_ERROR',
    message:
      'Nie udało się uzyskać odpowiedzi z darmowego Google Gemini API. Spróbuj ponownie za chwilę.',
  };
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

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({limit: '1mb'}));

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

  // Server-side Poland location generator (Wikidata SPARQL + batched Wikimedia/Wikipedia verification)
  app.post('/api/location-generator/voivodeship', async (req: Request, res: Response) => {
    const parsed = VoivodeshipGeneratorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Nieprawidłowe parametry żądania generatora województwa.'});
      return;
    }

    try {
      const result = await generateVoivodeshipLocations(parsed.data);
      res.json(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Nie udało się pobrać zweryfikowanych lokalizacji z Wikidaty.';
      res.status(502).json({error: message});
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

  // 2. Free-Tier Geographical Detective (gemini-4-hydrogen, ThinkingLevel.MEDIUM)
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

  const httpServer = http.createServer(app);

  if (!IS_PROD) {
    const {createServer: createViteServer} = await import('vite');
    const enableHmr = process.env.ENABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: enableHmr ? {server: httpServer} : false,
        hmr: enableHmr ? {server: httpServer} : false,
      },
      appType: 'spa',
    });
    if (!enableHmr) {
      app.get('/@vite/client', async (_req: Request, res: Response, next) => {
        try {
          const transformed = await vite.transformRequest('/@vite/client');
          if (!transformed) {
            next();
            return;
          }
          const patchedCode = transformed.code.replace(
            /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
            'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });',
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.send(patchedCode);
        } catch (err) {
          next(err);
        }
      });
    }
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`GeoPolska server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
