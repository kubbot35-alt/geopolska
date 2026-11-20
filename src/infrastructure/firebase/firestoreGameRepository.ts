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
import {normalizeScoreToStandard5Rounds} from '../../domain/geoScoring';
import type {
  DailyLeaderboardEntry,
  GameSyncStatus,
  IGamePersistenceRepository,
  LeaderboardEntry,
  PlayerIdentity,
  Result,
  RoundCountOption,
  RoundOutcome,
  StoredGameSummary,
} from '../../domain/types';
import {
  enqueueOfflineGame,
  listQueuedOfflineGames,
  removeQueuedOfflineGame,
  type QueuedGamePayload,
} from '../storage/indexedDbOutbox';
import {OperationType, db, handleFirestoreError} from './firebaseClient';

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
}

const VALID_ROUND_COUNTS = new Set<number>([3, 5, 10, 15, 20]);

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
        error: 'Zapis wymaga ukończenia gry o obsługiwanej liczbie rund (3, 5, 10, 15 lub 20).',
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
}

export const gameRepository = new FirestoreGameRepository();
