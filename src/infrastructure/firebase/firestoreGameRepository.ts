import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {z} from 'zod';
import {ROUND_COUNT_OPTIONS} from '../../domain/gameMachine';
import {normalizeScoreToStandard5Rounds} from '../../domain/geoScoring';
import {
  STANDARD_DATE_KEY,
  buildRankingDocumentId,
  sanitizeRankingActorId,
  sortUnifiedRankings,
  validateGuestNickname,
} from '../../domain/rankings';
import type {
  DailyLeaderboardEntry,
  GameSyncStatus,
  GuestRankingSaveResult,
  GuestRankingSubmissionInput,
  IGamePersistenceRepository,
  LeaderboardEntry,
  PlayerIdentity,
  RankingMode,
  Result,
  RoundCountOption,
  RoundOutcome,
  StoredGameSummary,
  UnifiedRankingEntry,
} from '../../domain/types';
import {
  enqueueOfflineGuestRanking,
  listQueuedOfflineGuestRankings,
  removeQueuedOfflineGuestRanking,
  type QueuedGuestRanking,
} from '../storage/guestProfileCache';
import {
  enqueueOfflineGame,
  listQueuedOfflineGames,
  removeQueuedOfflineGame,
  type QueuedGamePayload,
} from '../storage/indexedDbOutbox';
import {OperationType, auth, db, handleFirestoreError} from './firebaseClient';

const RANKINGS_COLLECTION = 'rankings';

const FirestoreRankingDocSchema = z.object({
  id: z.string().min(1).max(128),
  playerType: z.enum(['guest', 'authenticated']),
  actorId: z.string().min(1).max(128),
  gameMode: z.enum(['standard', 'daily']),
  dateKey: z.string().min(3).max(10),
  playerName: z.string().min(1).max(60),
  photoUrl: z.string().max(500),
  bestScore: z.number().int().min(0).max(25000),
  rawScore: z.number().int().min(0).max(500000),
  roundsCount: z.number().int().min(3).max(100),
  averageDistanceKm: z.number().min(0).max(25000),
  gamesPlayed: z.number().int().min(1).max(100000),
  timedMode: z.boolean(),
});

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Odkrywca';
  }
  return trimmed.slice(0, 60);
}

function sanitizePhotoUrl(url: string): string {
  return url.trim().slice(0, 500);
}

function createIdempotentGameId(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 10);
  return `game_${safeUid}_${Date.now()}_${rand}`.slice(0, 120);
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

function isOfflineNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('offline') || msg.includes('unavailable') || msg.includes('network');
}

async function ensureUserProfile(
  player: PlayerIdentity,
  deltaScore: number,
  runScore: number,
): Promise<{gamesPlayed: number; bestScore: number}> {
  const userPath = `users/${player.uid}`;
  const userRef = doc(db, 'users', player.uid);
  const displayName = sanitizeName(player.displayName);
  const photoUrl = sanitizePhotoUrl(player.photoUrl);

  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      const nextGamesPlayed = deltaScore > 0 || runScore >= 0 ? 1 : 0;
      const clampedScore = Math.max(0, Math.min(25000, Math.round(runScore)));
      await setDoc(userRef, {
        uid: player.uid,
        displayName,
        photoUrl,
        gamesPlayed: nextGamesPlayed,
        bestScore: clampedScore,
        totalScore: clampedScore,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {gamesPlayed: nextGamesPlayed, bestScore: clampedScore};
    }

    const data = existingSnap.data();
    const prevGames = typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0;
    const prevBest = typeof data.bestScore === 'number' ? data.bestScore : 0;
    const prevTotal = typeof data.totalScore === 'number' ? data.totalScore : 0;

    const clampedScore = Math.max(0, Math.min(25000, Math.round(runScore)));
    const nextGamesPlayed = prevGames + 1;
    const nextBest = Math.max(prevBest, clampedScore);
    const nextTotal = prevTotal + clampedScore;

    await updateDoc(userRef, {
      displayName,
      photoUrl,
      gamesPlayed: nextGamesPlayed,
      bestScore: nextBest,
      totalScore: nextTotal,
      updatedAt: serverTimestamp(),
    });

    return {gamesPlayed: nextGamesPlayed, bestScore: nextBest};
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

async function persistDailyLeaderboardIfFirst(
  player: PlayerIdentity,
  payload: QueuedGamePayload,
): Promise<void> {
  const dateKey = payload.dailyDateKey;
  if (!dateKey || payload.roundsCount !== 5) {
    return;
  }

  const entryId = `${dateKey}_${player.uid}`;
  const dailyPath = `dailyLeaderboard/${entryId}`;
  const dailyRef = doc(db, 'dailyLeaderboard', entryId);

  try {
    const existingEntry = await getDoc(dailyRef);
    if (existingEntry.exists()) {
      // Official first attempt already recorded for today
      return;
    }
    await setDoc(dailyRef, {
      dateKey,
      uid: player.uid,
      playerName: sanitizeName(payload.playerName),
      photoUrl: sanitizePhotoUrl(payload.photoUrl),
      score: Math.max(0, Math.min(25000, Math.round(payload.totalScore))),
      averageDistanceKm: payload.averageDistanceKm,
      timedMode: payload.timedMode,
      createdAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, dailyPath);
  }
}

async function persistPayloadToFirestore(
  player: PlayerIdentity,
  payload: QueuedGamePayload,
): Promise<void> {
  const normalizedBest = normalizeScoreToStandard5Rounds(payload.totalScore, payload.roundsCount);
  const profileStats = await ensureUserProfile(player, normalizedBest, normalizedBest);

  const gamePath = `games/${payload.id}`;
  const gameRef = doc(db, 'games', payload.id);
  try {
    const existingGame = await getDoc(gameRef);
    if (!existingGame.exists()) {
      await setDoc(gameRef, {
        uid: player.uid,
        playerName: sanitizeName(payload.playerName),
        totalScore: payload.totalScore,
        averageDistanceKm: payload.averageDistanceKm,
        timedMode: payload.timedMode,
        roundsCount: payload.roundsCount,
        roundLocations: payload.roundLocations.map((name) => name.slice(0, 80)),
        roundScores: payload.roundScores,
        roundDistances: payload.roundDistances,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, gamePath);
  }

  const leaderboardPath = `leaderboard/${player.uid}`;
  const leaderboardRef = doc(db, 'leaderboard', player.uid);
  try {
    const existingBoard = await getDoc(leaderboardRef);
    if (!existingBoard.exists()) {
      await setDoc(leaderboardRef, {
        uid: player.uid,
        playerName: sanitizeName(payload.playerName),
        photoUrl: sanitizePhotoUrl(payload.photoUrl),
        bestScore: normalizedBest,
        averageDistanceKm: payload.averageDistanceKm,
        gamesPlayed: Math.max(1, profileStats.gamesPlayed),
        timedMode: payload.timedMode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = existingBoard.data();
      const prevBest = typeof prev.bestScore === 'number' ? prev.bestScore : 0;
      const isNewRecord = normalizedBest >= prevBest;
      await updateDoc(leaderboardRef, {
        playerName: sanitizeName(payload.playerName),
        photoUrl: sanitizePhotoUrl(payload.photoUrl),
        bestScore: isNewRecord ? normalizedBest : prevBest,
        averageDistanceKm: isNewRecord
          ? payload.averageDistanceKm
          : typeof prev.averageDistanceKm === 'number'
            ? prev.averageDistanceKm
            : payload.averageDistanceKm,
        gamesPlayed: Math.max(1, profileStats.gamesPlayed),
        timedMode: isNewRecord ? payload.timedMode : Boolean(prev.timedMode),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, leaderboardPath);
  }

  if (payload.dailyDateKey) {
    await persistDailyLeaderboardIfFirst(player, payload);
  }

  await persistAuthenticatedUnifiedRanking(player, payload, normalizedBest, profileStats.gamesPlayed);
}

async function persistAuthenticatedUnifiedRanking(
  player: PlayerIdentity,
  payload: QueuedGamePayload,
  normalizedScore: number,
  profileGamesPlayed: number,
): Promise<void> {
  const isDaily = Boolean(payload.dailyDateKey) && payload.roundsCount === 5;
  const gameMode: RankingMode = isDaily ? 'daily' : 'standard';
  const dateKey = isDaily && payload.dailyDateKey ? payload.dailyDateKey : STANDARD_DATE_KEY;
  const rankingId = buildRankingDocumentId('authenticated', player.uid, gameMode, dateKey);
  const rankingPath = `${RANKINGS_COLLECTION}/${rankingId}`;
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);

  try {
    const existingSnap = await getDoc(rankingRef);
    if (isDaily && existingSnap.exists()) {
      return;
    }

    const playerName = sanitizeName(payload.playerName);
    const photoUrl = sanitizePhotoUrl(payload.photoUrl);
    const rawScore = Math.max(0, Math.min(payload.roundsCount * 5000, Math.round(payload.totalScore)));
    const avgDist = Math.max(0, Math.min(25000, Math.round(payload.averageDistanceKm * 10) / 10));

    if (!existingSnap.exists()) {
      await setDoc(rankingRef, {
        id: rankingId,
        playerType: 'authenticated',
        actorId: player.uid,
        gameMode,
        dateKey,
        playerName,
        photoUrl,
        bestScore: normalizedScore,
        rawScore,
        roundsCount: payload.roundsCount,
        averageDistanceKm: avgDist,
        gamesPlayed: isDaily ? 1 : Math.max(1, profileGamesPlayed),
        timedMode: payload.timedMode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const prev = existingSnap.data();
    const prevBest = typeof prev.bestScore === 'number' ? prev.bestScore : 0;
    const prevGames = typeof prev.gamesPlayed === 'number' ? prev.gamesPlayed : 1;
    const isNewRecord = normalizedScore >= prevBest;

    await updateDoc(rankingRef, {
      playerName,
      photoUrl,
      bestScore: isNewRecord ? normalizedScore : prevBest,
      rawScore: isNewRecord
        ? rawScore
        : typeof prev.rawScore === 'number'
          ? prev.rawScore
          : rawScore,
      roundsCount: isNewRecord
        ? payload.roundsCount
        : typeof prev.roundsCount === 'number'
          ? prev.roundsCount
          : payload.roundsCount,
      averageDistanceKm: isNewRecord
        ? avgDist
        : typeof prev.averageDistanceKm === 'number'
          ? prev.averageDistanceKm
          : avgDist,
      gamesPlayed: Math.max(prevGames + 1, profileGamesPlayed),
      timedMode: isNewRecord ? payload.timedMode : Boolean(prev.timedMode),
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, rankingPath);
  }
}

async function persistGuestRankingPayload(
  input: GuestRankingSubmissionInput,
): Promise<GuestRankingSaveResult> {
  const safeActorId = sanitizeRankingActorId(input.guestClientId);
  const isDaily = input.gameMode === 'daily' && Boolean(input.dailyDateKey);
  const gameMode: RankingMode = isDaily ? 'daily' : 'standard';
  const dateKey = isDaily && input.dailyDateKey ? input.dailyDateKey : STANDARD_DATE_KEY;
  const rankingId = buildRankingDocumentId('guest', safeActorId, gameMode, dateKey);
  const rankingPath = `${RANKINGS_COLLECTION}/${rankingId}`;
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);

  const normalizedScore = normalizeScoreToStandard5Rounds(input.totalScore, input.roundsCount);
  const rawScore = Math.max(0, Math.min(input.roundsCount * 5000, Math.round(input.totalScore)));
  const avgDist = Math.max(0, Math.min(25000, Math.round(input.averageDistanceKm * 10) / 10));

  try {
    const existingSnap = await getDoc(rankingRef);
    if (isDaily && existingSnap.exists()) {
      return {
        status: 'already_recorded_today',
        entryId: rankingId,
        nickname: input.nickname,
        normalizedScore,
      };
    }

    if (!existingSnap.exists()) {
      await setDoc(rankingRef, {
        id: rankingId,
        playerType: 'guest',
        actorId: safeActorId,
        gameMode,
        dateKey,
        playerName: input.nickname,
        photoUrl: '',
        bestScore: normalizedScore,
        rawScore,
        roundsCount: input.roundsCount,
        averageDistanceKm: avgDist,
        gamesPlayed: 1,
        timedMode: input.timedMode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = existingSnap.data();
      const prevBest = typeof prev.bestScore === 'number' ? prev.bestScore : 0;
      const prevGames = typeof prev.gamesPlayed === 'number' ? prev.gamesPlayed : 1;
      const isNewRecord = normalizedScore >= prevBest;

      await updateDoc(rankingRef, {
        playerName: input.nickname,
        bestScore: isNewRecord ? normalizedScore : prevBest,
        rawScore: isNewRecord
          ? rawScore
          : typeof prev.rawScore === 'number'
            ? prev.rawScore
            : rawScore,
        roundsCount: isNewRecord
          ? input.roundsCount
          : typeof prev.roundsCount === 'number'
            ? prev.roundsCount
            : input.roundsCount,
        averageDistanceKm: isNewRecord
          ? avgDist
          : typeof prev.averageDistanceKm === 'number'
            ? prev.averageDistanceKm
            : avgDist,
        gamesPlayed: Math.min(100000, prevGames + 1),
        timedMode: isNewRecord ? input.timedMode : Boolean(prev.timedMode),
        updatedAt: serverTimestamp(),
      });
    }

    return {
      status: 'saved',
      entryId: rankingId,
      nickname: input.nickname,
      normalizedScore,
    };
  } catch (error: unknown) {
    if (isOfflineNetworkError(error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, rankingPath);
  }
}

const VALID_ROUND_COUNTS = new Set<number>(ROUND_COUNT_OPTIONS);

export class FirestoreGameRepository implements IGamePersistenceRepository {
  async saveCompletedGame(
    player: PlayerIdentity,
    rounds: readonly RoundOutcome[],
    totalScore: number,
    averageDistanceKm: number,
    timedMode: boolean,
    dailyDateKey?: string | null,
  ): Promise<Result<GameSyncStatus, string>> {
    if (!VALID_ROUND_COUNTS.has(rounds.length)) {
      return {
        ok: false,
        error: `Zapis wymaga ukończenia gry o obsługiwanej liczbie rund (${ROUND_COUNT_OPTIONS.join(', ')}).`,
      };
    }

    const roundsCount = rounds.length as RoundCountOption;
    const maxAllowedScore = roundsCount * 5000;

    const payload: QueuedGamePayload = {
      id: createIdempotentGameId(player.uid),
      uid: player.uid,
      playerName: sanitizeName(player.displayName),
      photoUrl: sanitizePhotoUrl(player.photoUrl),
      totalScore: Math.max(0, Math.min(maxAllowedScore, Math.round(totalScore))),
      averageDistanceKm: Math.max(0, Math.round(averageDistanceKm * 10) / 10),
      timedMode,
      roundsCount,
      roundLocations: rounds.map((r) => r.location.name.slice(0, 80)),
      roundScores: rounds.map((r) => Math.max(0, Math.min(5000, Math.round(r.scoreBreakdown.finalScore)))),
      roundDistances: rounds.map((r) => Math.max(0, Math.round(r.distanceKm * 10) / 10)),
      ...(dailyDateKey ? {dailyDateKey} : {}),
      queuedAtIso: new Date().toISOString(),
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queued = await enqueueOfflineGame(payload);
      return queued
        ? {ok: true, value: 'offline_queued'}
        : {ok: false, error: 'Brak sieci i nie udało się zapisać gry w pamięci offline.'};
    }

    try {
      await persistPayloadToFirestore(player, payload);
      return {ok: true, value: 'saved'};
    } catch (error: unknown) {
      if (isOfflineNetworkError(error)) {
        const queued = await enqueueOfflineGame(payload);
        if (queued) {
          return {ok: true, value: 'offline_queued'};
        }
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Nie udało się zapisać wyniku w bazie Firebase.',
      };
    }
  }

  async flushOfflineOutbox(player: PlayerIdentity): Promise<number> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 0;
    }
    const queuedItems = await listQueuedOfflineGames(player.uid);
    let syncedCount = 0;
    for (const item of queuedItems) {
      try {
        await persistPayloadToFirestore(player, item);
        await removeQueuedOfflineGame(item.id);
        syncedCount += 1;
      } catch {
        break;
      }
    }
    return syncedCount;
  }

  async fetchLeaderboard(limitCount = 20): Promise<Result<readonly LeaderboardEntry[], string>> {
    const path = 'leaderboard';
    try {
      const q = query(
        collection(db, path),
        orderBy('bestScore', 'desc'),
        limit(limitCount),
      );
      const snapshot = await getDocs(q);
      const entries: LeaderboardEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        entries.push({
          uid: typeof data.uid === 'string' ? data.uid : docSnap.id,
          playerName: typeof data.playerName === 'string' ? data.playerName : 'Gracz',
          photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
          bestScore: typeof data.bestScore === 'number' ? data.bestScore : 0,
          averageDistanceKm: typeof data.averageDistanceKm === 'number' ? data.averageDistanceKm : 0,
          gamesPlayed: typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 1,
          timedMode: Boolean(data.timedMode),
          updatedAtIso: timestampToIso(data.updatedAt),
        });
      });
      return {ok: true, value: entries};
    } catch (error: unknown) {
      if (isOfflineNetworkError(error)) {
        return {ok: false, error: 'Tryb offline — ranking globalny wymaga połączenia z internetem.'};
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async fetchDailyLeaderboard(
    dateKey: string,
    limitCount = 30,
  ): Promise<Result<readonly DailyLeaderboardEntry[], string>> {
    const path = 'dailyLeaderboard';
    try {
      // Single-field equality filter avoids composite index requirements; sorted deterministically in memory.
      const q = query(
        collection(db, path),
        where('dateKey', '==', dateKey),
        limit(120),
      );
      const snapshot = await getDocs(q);
      const entries: DailyLeaderboardEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        entries.push({
          id: docSnap.id,
          dateKey: typeof data.dateKey === 'string' ? data.dateKey : dateKey,
          uid: typeof data.uid === 'string' ? data.uid : '',
          playerName: typeof data.playerName === 'string' ? data.playerName : 'Gracz',
          photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
          score: typeof data.score === 'number' ? data.score : 0,
          averageDistanceKm: typeof data.averageDistanceKm === 'number' ? data.averageDistanceKm : 0,
          timedMode: Boolean(data.timedMode),
          createdAtIso: timestampToIso(data.createdAt),
        });
      });

      entries.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.averageDistanceKm - b.averageDistanceKm;
      });

      return {ok: true, value: entries.slice(0, limitCount)};
    } catch (error: unknown) {
      if (isOfflineNetworkError(error)) {
        return {ok: false, error: 'Tryb offline — ranking dnia wymaga połączenia z internetem.'};
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async fetchUserDailyAttempt(
    dateKey: string,
    uid: string,
  ): Promise<Result<DailyLeaderboardEntry | null, string>> {
    const entryId = `${dateKey}_${uid}`;
    try {
      const snap = await getDoc(doc(db, 'dailyLeaderboard', entryId));
      if (!snap.exists()) {
        return {ok: true, value: null};
      }
      const data = snap.data();
      return {
        ok: true,
        value: {
          id: snap.id,
          dateKey: typeof data.dateKey === 'string' ? data.dateKey : dateKey,
          uid: typeof data.uid === 'string' ? data.uid : uid,
          playerName: typeof data.playerName === 'string' ? data.playerName : 'Gracz',
          photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
          score: typeof data.score === 'number' ? data.score : 0,
          averageDistanceKm: typeof data.averageDistanceKm === 'number' ? data.averageDistanceKm : 0,
          timedMode: Boolean(data.timedMode),
          createdAtIso: timestampToIso(data.createdAt),
        },
      };
    } catch {
      // Non-critical startup check — fall back to local daily cache cleanly
      return {ok: true, value: null};
    }
  }

  async fetchPlayerHistory(uid: string, limitCount = 15): Promise<Result<readonly StoredGameSummary[], string>> {
    const path = 'games';
    try {
      const q = query(
        collection(db, path),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
      const snapshot = await getDocs(q);
      const items: StoredGameSummary[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          uid: typeof data.uid === 'string' ? data.uid : uid,
          playerName: typeof data.playerName === 'string' ? data.playerName : 'Gracz',
          totalScore: typeof data.totalScore === 'number' ? data.totalScore : 0,
          averageDistanceKm: typeof data.averageDistanceKm === 'number' ? data.averageDistanceKm : 0,
          timedMode: Boolean(data.timedMode),
          roundsCount: typeof data.roundsCount === 'number' ? data.roundsCount : 5,
          roundLocations: Array.isArray(data.roundLocations)
            ? data.roundLocations.filter((v): v is string => typeof v === 'string')
            : [],
          roundScores: Array.isArray(data.roundScores)
            ? data.roundScores.filter((v): v is number => typeof v === 'number')
            : [],
          roundDistances: Array.isArray(data.roundDistances)
            ? data.roundDistances.filter((v): v is number => typeof v === 'number')
            : [],
          createdAtIso: timestampToIso(data.createdAt),
        });
      });
      return {ok: true, value: items};
    } catch (error: unknown) {
      if (isOfflineNetworkError(error)) {
        return {ok: false, error: 'Tryb offline — historia z chmury pojawi się po odzyskaniu sieci.'};
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async saveGuestRanking(
    input: GuestRankingSubmissionInput,
  ): Promise<Result<GuestRankingSaveResult, string>> {
    if (!VALID_ROUND_COUNTS.has(input.roundsCount)) {
      return {
        ok: false,
        error: 'Nieobsługiwana liczba rund do zapisu w rankingu.',
      };
    }

    const validatedNick = validateGuestNickname(input.nickname);
    if (!validatedNick.ok) {
      return {ok: false, error: validatedNick.error};
    }

    const cleanInput: GuestRankingSubmissionInput = {
      ...input,
      guestClientId: sanitizeRankingActorId(input.guestClientId),
      nickname: validatedNick.value,
      totalScore: Math.max(0, Math.min(input.roundsCount * 5000, Math.round(input.totalScore))),
      averageDistanceKm: Math.max(0, Math.min(25000, Math.round(input.averageDistanceKm * 10) / 10)),
    };

    const normalizedScore = normalizeScoreToStandard5Rounds(
      cleanInput.totalScore,
      cleanInput.roundsCount,
    );
    const isDaily = cleanInput.gameMode === 'daily' && Boolean(cleanInput.dailyDateKey);
    const dateKey = isDaily && cleanInput.dailyDateKey ? cleanInput.dailyDateKey : STANDARD_DATE_KEY;
    const entryId = buildRankingDocumentId('guest', cleanInput.guestClientId, cleanInput.gameMode, dateKey);

    const queueItem: QueuedGuestRanking = {
      queueKey: `${entryId}_${Date.now()}`,
      guestClientId: cleanInput.guestClientId,
      nickname: cleanInput.nickname,
      gameMode: cleanInput.gameMode,
      dailyDateKey: isDaily ? dateKey : null,
      totalScore: cleanInput.totalScore,
      roundsCount: cleanInput.roundsCount,
      averageDistanceKm: cleanInput.averageDistanceKm,
      timedMode: cleanInput.timedMode,
      queuedAtIso: new Date().toISOString(),
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queued = await enqueueOfflineGuestRanking(queueItem);
      return queued
        ? {
            ok: true,
            value: {
              status: 'offline_queued',
              entryId,
              nickname: cleanInput.nickname,
              normalizedScore,
            },
          }
        : {ok: false, error: 'Brak sieci i nie udało się zapisać wyniku w pamięci offline.'};
    }

    try {
      const result = await persistGuestRankingPayload(cleanInput);
      return {ok: true, value: result};
    } catch (error: unknown) {
      if (isOfflineNetworkError(error)) {
        const queued = await enqueueOfflineGuestRanking(queueItem);
        if (queued) {
          return {
            ok: true,
            value: {
              status: 'offline_queued',
              entryId,
              nickname: cleanInput.nickname,
              normalizedScore,
            },
          };
        }
      }
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Nie udało się zapisać wyniku gościa w bazie Firebase.',
      };
    }
  }

  async flushOfflineGuestRankings(): Promise<number> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 0;
    }
    if (auth.currentUser !== null) {
      return 0;
    }
    const items = await listQueuedOfflineGuestRankings();
    let synced = 0;
    for (const item of items) {
      try {
        await persistGuestRankingPayload({
          guestClientId: item.guestClientId,
          nickname: item.nickname,
          gameMode: item.gameMode,
          dailyDateKey: item.dailyDateKey,
          totalScore: item.totalScore,
          roundsCount: item.roundsCount,
          averageDistanceKm: item.averageDistanceKm,
          timedMode: item.timedMode,
        });
        await removeQueuedOfflineGuestRanking(item.queueKey);
        synced += 1;
      } catch {
        break;
      }
    }
    return synced;
  }

  async fetchUnifiedRankings(
    mode: RankingMode,
    dateKey: string | null,
    limitCount = 60,
  ): Promise<Result<readonly UnifiedRankingEntry[], string>> {
    const targetDateKey = mode === 'daily' && dateKey ? dateKey : STANDARD_DATE_KEY;
    try {
      const q = query(
        collection(db, RANKINGS_COLLECTION),
        where('dateKey', '==', targetDateKey),
        limit(150),
      );
      const snapshot = await getDocs(q);
      const entriesById = new Map<string, UnifiedRankingEntry>();
      const authenticatedActors = new Set<string>();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const parsed = FirestoreRankingDocSchema.safeParse(data);
        if (!parsed.success || parsed.data.gameMode !== mode) {
          return;
        }
        const entry: UnifiedRankingEntry = {
          id: parsed.data.id,
          playerType: parsed.data.playerType,
          actorId: parsed.data.actorId,
          gameMode: parsed.data.gameMode,
          dateKey: parsed.data.dateKey,
          playerName: parsed.data.playerName,
          photoUrl: parsed.data.photoUrl,
          bestScore: parsed.data.bestScore,
          rawScore: parsed.data.rawScore,
          roundsCount: parsed.data.roundsCount,
          averageDistanceKm: parsed.data.averageDistanceKm,
          gamesPlayed: parsed.data.gamesPlayed,
          timedMode: parsed.data.timedMode,
          createdAtIso: timestampToIso(data.createdAt),
          updatedAtIso: timestampToIso(data.updatedAt),
        };
        entriesById.set(entry.id, entry);
        if (entry.playerType === 'authenticated') {
          authenticatedActors.add(entry.actorId);
        }
      });

      // Backwards-compatible merge of legacy authenticated records not yet mirrored into /rankings
      if (mode === 'standard') {
        const legacyRes = await this.fetchLeaderboard(30).catch(() => null);
        if (legacyRes && legacyRes.ok) {
          for (const legacy of legacyRes.value) {
            if (!authenticatedActors.has(legacy.uid)) {
              const syntheticId = buildRankingDocumentId('authenticated', legacy.uid, 'standard', STANDARD_DATE_KEY);
              entriesById.set(syntheticId, {
                id: syntheticId,
                playerType: 'authenticated',
                actorId: legacy.uid,
                gameMode: 'standard',
                dateKey: STANDARD_DATE_KEY,
                playerName: legacy.playerName,
                photoUrl: legacy.photoUrl,
                bestScore: legacy.bestScore,
                rawScore: legacy.bestScore,
                roundsCount: 5,
                averageDistanceKm: legacy.averageDistanceKm,
                gamesPlayed: legacy.gamesPlayed,
                timedMode: legacy.timedMode,
                createdAtIso: legacy.updatedAtIso,
                updatedAtIso: legacy.updatedAtIso,
              });
            }
          }
        }
      } else if (dateKey) {
        const legacyDailyRes = await this.fetchDailyLeaderboard(dateKey, 30).catch(() => null);
        if (legacyDailyRes && legacyDailyRes.ok) {
          for (const legacy of legacyDailyRes.value) {
            if (!authenticatedActors.has(legacy.uid)) {
              const syntheticId = buildRankingDocumentId('authenticated', legacy.uid, 'daily', dateKey);
              entriesById.set(syntheticId, {
                id: syntheticId,
                playerType: 'authenticated',
                actorId: legacy.uid,
                gameMode: 'daily',
                dateKey,
                playerName: legacy.playerName,
                photoUrl: legacy.photoUrl,
                bestScore: legacy.score,
                rawScore: legacy.score,
                roundsCount: 5,
                averageDistanceKm: legacy.averageDistanceKm,
                gamesPlayed: 1,
                timedMode: legacy.timedMode,
                createdAtIso: legacy.createdAtIso,
                updatedAtIso: legacy.createdAtIso,
              });
            }
          }
        }
      }

      const sorted = sortUnifiedRankings(Array.from(entriesById.values()));
      return {ok: true, value: sorted.slice(0, limitCount)};
    } catch (error: unknown) {
      if (isOfflineNetworkError(error)) {
        return {ok: false, error: 'Tryb offline — tabela rankingów wymaga połączenia z internetem.'};
      }
      handleFirestoreError(error, OperationType.LIST, RANKINGS_COLLECTION);
    }
  }
}

export const gameRepository = new FirestoreGameRepository();
