import {validateCoordinatesForCatalog} from '../../domain/catalogSchema';
import {
  buildLocationTags,
  buildSpoilerFreeHint,
  cleanWikiFunFact,
  detectLocationDifficulty,
  detectRegionCategory,
  isSuspiciousPhotoFileName,
  parseWktPoint,
  truncateClean,
} from '../../domain/polandGeneratorSanitizer';
import {
  DEFAULT_PHOTO_FRESHNESS,
  FRESH_PHOTO_MIN_YEAR,
  findVoivodeshipConfig,
  type PhotoFreshnessMode,
  type VoivodeshipGenerationRequest,
  type VoivodeshipGenerationResponse,
} from '../../domain/polandGeneratorTypes';
import type {PolandLocation} from '../../domain/types';
import {batchFetchPolishWikiExtracts, batchVerifyCommonsImages} from './wikimediaBatchVerifier';
import {
  resolveFreshPhotosConcurrently,
  type FreshPhotoLookupTarget,
} from './wikimediaFreshPhotoFinder';

const WIKI_USER_AGENT = 'GeoPolska-Atlas/1.0 (https://geopolska.app; educational geography game)';
const SPARQL_TIMEOUT_MS = 45_000;
const COMPACT_LANDMARK_QIDS = new Set([
  'Q23413', 'Q16560', 'Q57821', 'Q2977', 'Q16970', 'Q44613',
  'Q33506', 'Q4989906', 'Q839954', 'Q207694', 'Q16999091',
  'Q8502', 'Q39715', 'Q863454', 'Q34038',
]);
const SENSITIVE_NAME_PATTERN =
  /auschwitz|birkenau|treblinka|majdanek|sobib[oó]r|be[lł][zż]ec|stutthof|gross-rosen|kulmhof|ob[oó]z\s+(koncentracyjny|zag[lł]ady)|cmentarz/i;

interface SparqlBindingValue {
  readonly value: string;
}

interface SparqlRow {
  readonly item?: SparqlBindingValue;
  readonly itemLabel?: SparqlBindingValue;
  readonly itemDescription?: SparqlBindingValue;
  readonly coord?: SparqlBindingValue;
  readonly image?: SparqlBindingValue;
  readonly commonsCat?: SparqlBindingValue;
  readonly article?: SparqlBindingValue;
  readonly sitelinks?: SparqlBindingValue;
  readonly type?: SparqlBindingValue;
}

interface PreFilteredCandidate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly lat: number;
  readonly lng: number;
  readonly fileName: string;
  readonly commonsCategory: string | null;
  readonly articleTitle: string;
  readonly sitelinks: number;
  readonly typeQid: string;
}

interface ResolvedCandidatePhoto {
  readonly candidate: PreFilteredCandidate;
  readonly imageUrl: string;
  readonly year: number | null;
}

function buildTypedSparqlQuery(voivodeshipQid: string, rowLimit: number): string {
  return `
SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?commonsCat ?article ?sitelinks ?type WHERE {
  VALUES ?type {
    wd:Q515 wd:Q3957 wd:Q1549591 wd:Q532
    wd:Q23413 wd:Q16560 wd:Q57821 wd:Q2977 wd:Q16970 wd:Q44613 wd:Q33506 wd:Q4989906 wd:Q839954 wd:Q207694 wd:Q16999091
    wd:Q8502 wd:Q39816 wd:Q46169 wd:Q179049 wd:Q34038
    wd:Q23397 wd:Q23442 wd:Q131681 wd:Q34763 wd:Q39715 wd:Q863454 wd:Q40080
  }
  ?item wdt:P131+ wd:${voivodeshipQid} ;
        wdt:P31 ?type ;
        wdt:P625 ?coord ;
        wdt:P18 ?image ;
        wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P373 ?commonsCat . }
  ?article schema:about ?item ;
           schema:isPartOf <https://pl.wikipedia.org/> .
  FILTER(REGEX(LCASE(STR(?image)), "\\\\.(jpg|jpeg)$"))
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q150093 }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q247073 }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q15334 }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q39614 }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pl". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${rowLimit}
`;
}

function buildCompactFallbackQuery(voivodeshipQid: string, rowLimit: number): string {
  return `
SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?commonsCat ?article ?sitelinks ?type WHERE {
  VALUES ?type { wd:Q515 wd:Q3957 wd:Q1549591 wd:Q23413 wd:Q16560 wd:Q57821 wd:Q8502 wd:Q23397 wd:Q39715 }
  ?item wdt:P131+ wd:${voivodeshipQid} ;
        wdt:P31 ?type ;
        wdt:P625 ?coord ;
        wdt:P18 ?image ;
        wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P373 ?commonsCat . }
  ?article schema:about ?item ;
           schema:isPartOf <https://pl.wikipedia.org/> .
  FILTER(REGEX(LCASE(STR(?image)), "\\\\.(jpg|jpeg)$"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pl". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${rowLimit}
`;
}

async function executeSparqlQuery(query: string): Promise<readonly SparqlRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);
  try {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {Accept: 'application/sparql-results+json', 'User-Agent': WIKI_USER_AGENT},
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Wikidata HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {results?: {bindings?: SparqlRow[]}};
    return payload.results?.bindings ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchVoivodeshipRows(
  qid: string,
  targetLimit: number,
  freshness: PhotoFreshnessMode,
): Promise<readonly SparqlRow[]> {
  const multiplier = freshness === 'only_2025_2026' ? 3.5 : 2.6;
  const rowLimit = Math.min(420, Math.max(140, Math.round(targetLimit * multiplier)));
  try {
    return await executeSparqlQuery(buildTypedSparqlQuery(qid, rowLimit));
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return await executeSparqlQuery(buildCompactFallbackQuery(qid, Math.min(260, rowLimit)));
  }
}

function decodeWikiTitle(articleUrl: string): string {
  const rawPart = articleUrl.split('/wiki/')[1] ?? '';
  try {
    return decodeURIComponent(rawPart).replace(/_/g, ' ').trim();
  } catch {
    return rawPart.replace(/_/g, ' ').trim();
  }
}

function decodeCommonsFileName(rawImageUrl: string): string {
  const rawName = rawImageUrl.split('/').pop() ?? '';
  try {
    return decodeURIComponent(rawName).replace(/_/g, ' ').trim();
  } catch {
    return rawName.replace(/_/g, ' ').trim();
  }
}

function preFilterRows(
  rows: readonly SparqlRow[],
  excludedNames: ReadonlySet<string>,
  maxPoolSize: number,
  freshness: PhotoFreshnessMode,
): {
  readonly candidates: readonly PreFilteredCandidate[];
  readonly rejectedQuality: number;
  readonly rejectedDuplicate: number;
} {
  const candidates: PreFilteredCandidate[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  let rejectedQuality = 0;
  let rejectedDuplicate = 0;

  for (const row of rows) {
    if (candidates.length >= maxPoolSize) break;
    const qid = row.item?.value.split('/').pop() ?? '';
    const id = `pl-${qid.toLowerCase()}`;
    if (!qid || !/^pl-q\d+$/.test(id) || seenIds.has(id)) {
      rejectedDuplicate += 1;
      continue;
    }
    const name = row.itemLabel?.value.trim() ?? '';
    const normName = name.toLowerCase();
    if (!name || /^Q\d+$/.test(name) || SENSITIVE_NAME_PATTERN.test(name)) {
      rejectedQuality += 1;
      continue;
    }
    if (excludedNames.has(normName) || seenNames.has(normName)) {
      rejectedDuplicate += 1;
      continue;
    }
    const coords = parseWktPoint(row.coord?.value ?? '');
    if (!coords || !validateCoordinatesForCatalog('poland', coords.lat, coords.lng)) {
      rejectedQuality += 1;
      continue;
    }
    const rawImage = row.image?.value ?? '';
    if (freshness === 'any' && (!rawImage || isSuspiciousPhotoFileName(rawImage))) {
      rejectedQuality += 1;
      continue;
    }
    const articleTitle = decodeWikiTitle(row.article?.value ?? '');
    const fileName = decodeCommonsFileName(rawImage);
    if (!articleTitle) {
      rejectedQuality += 1;
      continue;
    }
    seenIds.add(id);
    seenNames.add(normName);
    candidates.push({
      id,
      name: truncateClean(name, 120),
      description: row.itemDescription?.value.trim() ?? '',
      lat: coords.lat,
      lng: coords.lng,
      fileName: isSuspiciousPhotoFileName(rawImage) ? '' : fileName,
      commonsCategory: row.commonsCat?.value.trim() || null,
      articleTitle,
      sitelinks: Number.parseInt(row.sitelinks?.value ?? '0', 10) || 0,
      typeQid: row.type?.value.split('/').pop() ?? '',
    });
  }
  return {candidates, rejectedQuality, rejectedDuplicate};
}

async function resolvePhotosForMode(
  candidates: readonly PreFilteredCandidate[],
  safeLimit: number,
  freshness: PhotoFreshnessMode,
): Promise<{readonly resolved: readonly ResolvedCandidatePhoto[]; readonly verifiedCount: number}> {
  const p18Map = await batchVerifyCommonsImages(
    candidates.map((c) => c.fileName).filter((f) => f.length > 0),
  );

  if (freshness === 'any') {
    const resolved: ResolvedCandidatePhoto[] = [];
    for (const c of candidates) {
      if (resolved.length >= safeLimit) break;
      const img = p18Map.get(c.fileName.toLowerCase());
      if (img) resolved.push({candidate: c, imageUrl: img.imageUrl, year: img.year});
    }
    return {resolved, verifiedCount: p18Map.size};
  }

  const alreadyFreshIds = new Set<string>();
  const lookupTargets: FreshPhotoLookupTarget[] = [];
  for (const c of candidates) {
    const img = c.fileName ? p18Map.get(c.fileName.toLowerCase()) : undefined;
    if (img && img.year !== null && img.year >= FRESH_PHOTO_MIN_YEAR) {
      alreadyFreshIds.add(c.id);
      continue;
    }
    lookupTargets.push({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      commonsCategory: c.commonsCategory,
      isCompactLandmark: COMPACT_LANDMARK_QIDS.has(c.typeQid),
    });
  }

  const neededFresh = Math.max(0, safeLimit - alreadyFreshIds.size);
  const freshMap =
    neededFresh > 0
      ? await resolveFreshPhotosConcurrently(lookupTargets, neededFresh, 6)
      : new Map();

  const resolved: ResolvedCandidatePhoto[] = [];
  const usedUrls = new Set<string>();
  for (const c of candidates) {
    if (resolved.length >= safeLimit) break;
    const p18 = c.fileName ? p18Map.get(c.fileName.toLowerCase()) : undefined;
    if (p18 && p18.year !== null && p18.year >= FRESH_PHOTO_MIN_YEAR && !usedUrls.has(p18.imageUrl)) {
      usedUrls.add(p18.imageUrl);
      resolved.push({candidate: c, imageUrl: p18.imageUrl, year: p18.year});
      continue;
    }
    const freshHit = freshMap.get(c.id);
    if (freshHit && !usedUrls.has(freshHit.imageUrl)) {
      usedUrls.add(freshHit.imageUrl);
      resolved.push({candidate: c, imageUrl: freshHit.imageUrl, year: freshHit.year});
      continue;
    }
    if (freshness === 'prefer_2025_2026' && p18 && !usedUrls.has(p18.imageUrl)) {
      usedUrls.add(p18.imageUrl);
      resolved.push({candidate: c, imageUrl: p18.imageUrl, year: p18.year});
    }
  }

  return {resolved, verifiedCount: p18Map.size + freshMap.size};
}

export async function generateVoivodeshipLocations(
  request: VoivodeshipGenerationRequest,
): Promise<VoivodeshipGenerationResponse> {
  const config = findVoivodeshipConfig(request.voivodeship);
  if (!config) {
    throw new Error(`Nieznane województwo: ${request.voivodeship}`);
  }
  const safeLimit = Math.max(10, Math.min(120, Math.round(request.limit)));
  const freshness = request.photoFreshness ?? DEFAULT_PHOTO_FRESHNESS;
  const excludedSet = new Set(request.excludeNames.map((n) => n.trim().toLowerCase()));

  const rows = await fetchVoivodeshipRows(config.qid, safeLimit, freshness);
  const poolCap = freshness === 'only_2025_2026' ? Math.min(260, Math.round(safeLimit * 2.5)) : Math.min(200, Math.round(safeLimit * 1.9));
  const pre = preFilterRows(rows, excludedSet, poolCap, freshness);

  const {resolved, verifiedCount} = await resolvePhotosForMode(pre.candidates, safeLimit, freshness);
  const photoRejected = Math.max(0, pre.candidates.length - resolved.length);

  const extracts = await batchFetchPolishWikiExtracts(
    resolved.map((item) => item.candidate.articleTitle),
  );

  const photoYears: Record<string, number> = {};
  let freshPhotoCount = 0;

  const locations: PolandLocation[] = resolved.map(({candidate, imageUrl, year}) => {
    if (year !== null) {
      photoYears[candidate.id] = year;
      if (year >= FRESH_PHOTO_MIN_YEAR) freshPhotoCount += 1;
    }
    const extract = extracts.get(candidate.articleTitle.toLowerCase()) ?? '';
    const contextText = `${candidate.description} ${extract}`;
    const regionCategory = detectRegionCategory(
      candidate.name,
      contextText,
      config.name,
      candidate.typeQid,
    );
    const difficulty = detectLocationDifficulty(candidate.sitelinks);
    return {
      id: candidate.id,
      catalogKey: 'poland',
      name: candidate.name,
      voivodeship: config.name,
      lat: candidate.lat,
      lng: candidate.lng,
      imageUrl,
      hint: buildSpoilerFreeHint(
        extract,
        candidate.description,
        candidate.name,
        config.name,
        regionCategory,
      ),
      funFact: cleanWikiFunFact(extract, candidate.description, candidate.name, config.name),
      regionCategory,
      isClassicOffline: false,
      countryCode: 'PL',
      difficulty,
      tags: buildLocationTags(config.name, regionCategory, contextText),
      isActive: true,
    };
  });

  return {
    voivodeship: config.name,
    locations,
    photoYears,
    stats: {
      rawCandidates: rows.length,
      verifiedImages: verifiedCount,
      freshPhotoCount,
      accepted: locations.length,
      rejectedQuality: pre.rejectedQuality + photoRejected,
      rejectedDuplicate: pre.rejectedDuplicate,
    },
  };
}
