/**
 * Pure headless domain contracts, discriminated unions, and dependency-inversion ports for GeoPolska.
 * Contains zero UI, DOM, or third-party framework dependencies.
 */

export interface GeoCoordinate {
  readonly lat: number;
  readonly lng: number;
}

export type RegionCategory = 'miasto' | 'gory' | 'morze' | 'zabytek' | 'nad_woda';

export type LocationPoolFilter =
  | 'all'
  | 'miasto'
  | 'zabytek'
  | 'gory'
  | 'woda_morze'
  | 'classic_20';

export type RoundCountOption = 3 | 5 | 10 | 15 | 20;

export type StreetViewMovementMode = 'move' | 'no_move' | 'nmpz';

export type GameMode = 'standard' | 'daily' | 'custom';

export type MapStyleOption = 'dark' | 'satellite' | 'terrain';

export type VideoAspectRatio = '16:9' | '9:16';

export type ThreeCameraPreset = 'overview' | 'warszawa' | 'gdansk' | 'tatry';

export interface PolandLocation {
  readonly id: string;
  readonly name: string;
  readonly voivodeship: string;
  readonly lat: number;
  readonly lng: number;
  readonly imageUrl: string;
  readonly hint: string;
  readonly funFact: string;
  readonly regionCategory: RegionCategory;
  readonly isClassicOffline?: boolean;
  readonly orderIndex?: number;
}

export type HintLevel = 0 | 1 | 2;

export interface ScoreBreakdown {
  readonly baseScore: number;
  readonly hintPenalty: number;
  readonly maxPossibleScore: number;
  readonly finalScore: number;
}

export interface RoundOutcome {
  readonly roundNumber: number;
  readonly location: PolandLocation;
  readonly guess: GeoCoordinate | null;
  readonly distanceKm: number;
  readonly hintLevelUsed: HintLevel;
  readonly scoreBreakdown: ScoreBreakdown;
  readonly timedOut: boolean;
}

export type GameSyncStatus = 'idle' | 'saving' | 'saved' | 'offline_queued' | 'guest' | 'error';

export type GamePhase =
  | {
      readonly status: 'TITLE_MENU';
      readonly timedMode: boolean;
      readonly poolFilter: LocationPoolFilter;
      readonly selectedRoundCount: RoundCountOption;
      readonly movementMode: StreetViewMovementMode;
    }
  | {
      readonly status: 'PLAYING';
      readonly gameMode: GameMode;
      readonly dailyDateKey: string | null;
      readonly timedMode: boolean;
      readonly poolFilter: LocationPoolFilter;
      readonly selectedRoundCount: RoundCountOption;
      readonly movementMode: StreetViewMovementMode;
      readonly roundIndex: number;
      readonly totalRounds: number;
      readonly deck: readonly PolandLocation[];
      readonly currentLocation: PolandLocation;
      readonly failedLocationIds: readonly string[];
      readonly selectedGuess: GeoCoordinate | null;
      readonly hintLevel: HintLevel;
      readonly secondsRemaining: number;
      readonly completedRounds: readonly RoundOutcome[];
      readonly totalScore: number;
      readonly panoramaReloadNonce: number;
      readonly lastFallbackNotice: string | null;
    }
  | {
      readonly status: 'ROUND_RESULT';
      readonly gameMode: GameMode;
      readonly dailyDateKey: string | null;
      readonly timedMode: boolean;
      readonly poolFilter: LocationPoolFilter;
      readonly selectedRoundCount: RoundCountOption;
      readonly movementMode: StreetViewMovementMode;
      readonly roundIndex: number;
      readonly totalRounds: number;
      readonly deck: readonly PolandLocation[];
      readonly failedLocationIds: readonly string[];
      readonly lastOutcome: RoundOutcome;
      readonly completedRounds: readonly RoundOutcome[];
      readonly totalScore: number;
    }
  | {
      readonly status: 'SUMMARY';
      readonly gameMode: GameMode;
      readonly dailyDateKey: string | null;
      readonly timedMode: boolean;
      readonly poolFilter: LocationPoolFilter;
      readonly selectedRoundCount: RoundCountOption;
      readonly movementMode: StreetViewMovementMode;
      readonly completedRounds: readonly RoundOutcome[];
      readonly totalScore: number;
      readonly averageDistanceKm: number;
      readonly syncStatus: GameSyncStatus;
      readonly syncMessage: string | null;
    };

export type GameCommand =
  | {readonly type: 'SET_TIMED_MODE'; readonly timedMode: boolean}
  | {readonly type: 'SET_POOL_FILTER'; readonly poolFilter: LocationPoolFilter}
  | {readonly type: 'SET_ROUND_COUNT'; readonly roundCount: RoundCountOption}
  | {readonly type: 'SET_MOVEMENT_MODE'; readonly movementMode: StreetViewMovementMode}
  | {
      readonly type: 'START_GAME';
      readonly gameMode?: GameMode;
      readonly dailyDateKey?: string | null;
      readonly timedMode: boolean;
      readonly poolFilter: LocationPoolFilter;
      readonly roundCount: RoundCountOption;
      readonly movementMode: StreetViewMovementMode;
      readonly deck: readonly PolandLocation[];
    }
  | {readonly type: 'PLACE_PIN'; readonly coordinate: GeoCoordinate}
  | {readonly type: 'UNLOCK_NEXT_HINT'}
  | {readonly type: 'TICK_TIMER'}
  | {readonly type: 'SUBMIT_GUESS'}
  | {readonly type: 'EXPIRE_ROUND'}
  | {
      readonly type: 'SYNC_PANORAMA_COORDINATE';
      readonly locationId: string;
      readonly coordinate: GeoCoordinate;
    }
  | {
      readonly type: 'REPLACE_FAILED_LOCATION';
      readonly replacement: PolandLocation;
      readonly reason?: 'auto' | 'manual';
    }
  | {readonly type: 'RETRY_STREET_VIEW'}
  | {readonly type: 'NEXT_ROUND'}
  | {
      readonly type: 'SET_SYNC_STATUS';
      readonly syncStatus: GameSyncStatus;
      readonly syncMessage?: string | null;
    }
  | {readonly type: 'RETURN_TO_TITLE'};

export type Result<T, E = string> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly error: E};

export interface PlayerIdentity {
  readonly uid: string;
  readonly displayName: string;
  readonly photoUrl: string;
  readonly email?: string | null;
  readonly emailVerified: boolean;
}

export type LocationCatalogSource = 'firestore' | 'indexeddb_cache' | 'seed_fallback';

export interface CatalogMetaSnapshot {
  readonly id: string;
  readonly version: number;
  readonly totalCount: number;
  readonly updatedBy: string;
  readonly updatedAtIso: string;
}

export interface LoadedLocationCatalog {
  readonly locations: readonly PolandLocation[];
  readonly source: LocationCatalogSource;
  readonly version: number | null;
  readonly remoteCount: number | null;
  readonly isSyncedWithCloud: boolean;
}

export type LocationCatalogState =
  | {readonly status: 'loading'}
  | {
      readonly status: 'ready';
      readonly source: LocationCatalogSource;
      readonly version: number | null;
      readonly totalCount: number;
      readonly remoteCount: number | null;
      readonly isSyncedWithCloud: boolean;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly source: LocationCatalogSource;
      readonly totalCount: number;
    };

export interface LocationUpsertInput {
  readonly id: string;
  readonly name: string;
  readonly voivodeship: string;
  readonly lat: number;
  readonly lng: number;
  readonly imageUrl: string;
  readonly hint: string;
  readonly funFact: string;
  readonly regionCategory: RegionCategory;
  readonly isClassicOffline: boolean;
}

export interface StoredGameSummary {
  readonly id: string;
  readonly uid: string;
  readonly playerName: string;
  readonly totalScore: number;
  readonly averageDistanceKm: number;
  readonly timedMode: boolean;
  readonly roundsCount: number;
  readonly roundLocations: readonly string[];
  readonly roundScores: readonly number[];
  readonly roundDistances: readonly number[];
  readonly createdAtIso: string;
}

export interface LeaderboardEntry {
  readonly uid: string;
  readonly playerName: string;
  readonly photoUrl: string;
  readonly bestScore: number;
  readonly averageDistanceKm: number;
  readonly gamesPlayed: number;
  readonly timedMode: boolean;
  readonly updatedAtIso: string;
}

export interface DailyLeaderboardEntry {
  readonly id: string;
  readonly dateKey: string;
  readonly uid: string;
  readonly playerName: string;
  readonly photoUrl: string;
  readonly score: number;
  readonly averageDistanceKm: number;
  readonly timedMode: boolean;
  readonly createdAtIso: string;
}

export interface LocalDailyCompletion {
  readonly dateKey: string;
  readonly score: number;
  readonly averageDistanceKm: number;
  readonly completedAtIso: string;
}

export interface GroundingLink {
  readonly title: string;
  readonly uri: string;
  readonly snippet?: string;
}

export interface AiSearchFactsResult {
  readonly markdown: string;
  readonly sources: readonly GroundingLink[];
}

export interface AiMapsNearbyResult {
  readonly markdown: string;
  readonly places: readonly GroundingLink[];
}

export interface AiDeepAnalysisResult {
  readonly markdown: string;
  readonly model: string;
}

export type ChallengeRoundCountOption = 3 | 5 | 10;

export interface ChallengeCandidateSummary {
  readonly id: string;
  readonly name: string;
  readonly voivodeship: string;
  readonly regionCategory: RegionCategory;
}

export interface AiChallengeStop {
  readonly locationId: string;
  readonly customClue: string;
}

export interface AiThemedChallengeResult {
  readonly title: string;
  readonly briefing: string;
  readonly stops: readonly AiChallengeStop[];
  readonly model: string;
}

export interface AiAnimateVideoRequest {
  readonly imageBase64?: string;
  readonly mimeType?: string;
  readonly locationImageUrl?: string;
  readonly locationName?: string;
  readonly prompt: string;
  readonly aspectRatio: VideoAspectRatio;
}

export interface AiAnimateVideoResult {
  readonly videoDataUrl: string;
  readonly mimeType: string;
  readonly aspectRatio: VideoAspectRatio;
  readonly model: string;
}

export interface IGamePersistenceRepository {
  saveCompletedGame(
    player: PlayerIdentity,
    rounds: readonly RoundOutcome[],
    totalScore: number,
    averageDistanceKm: number,
    timedMode: boolean,
    dailyDateKey?: string | null,
  ): Promise<Result<GameSyncStatus, string>>;
  fetchLeaderboard(limitCount: number): Promise<Result<readonly LeaderboardEntry[], string>>;
  fetchDailyLeaderboard(
    dateKey: string,
    limitCount: number,
  ): Promise<Result<readonly DailyLeaderboardEntry[], string>>;
  fetchUserDailyAttempt(
    dateKey: string,
    uid: string,
  ): Promise<Result<DailyLeaderboardEntry | null, string>>;
  fetchPlayerHistory(uid: string, limitCount: number): Promise<Result<readonly StoredGameSummary[], string>>;
  flushOfflineOutbox(player: PlayerIdentity): Promise<number>;
}

export interface ILocationCatalogRepository {
  loadCatalog(options?: {
    readonly forceRefresh?: boolean;
    readonly signal?: AbortSignal;
  }): Promise<Result<LoadedLocationCatalog, string>>;
  fetchCatalogMeta(): Promise<Result<CatalogMetaSnapshot | null, string>>;
  migrateSeedLocations(
    seedLocations: readonly PolandLocation[],
    actorUid: string,
    onProgress?: (processed: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<Result<CatalogMetaSnapshot, string>>;
  upsertLocation(
    input: LocationUpsertInput,
    actorUid: string,
    nextOrderIndex: number,
  ): Promise<Result<PolandLocation, string>>;
  deleteLocation(locationId: string, actorUid: string): Promise<Result<void, string>>;
}

export interface IAiExplorerGateway {
  fetchSearchFacts(location: PolandLocation, signal: AbortSignal): Promise<Result<AiSearchFactsResult, string>>;
  fetchNearbyMapsPlaces(location: PolandLocation, signal: AbortSignal): Promise<Result<AiMapsNearbyResult, string>>;
  fetchDeepAnalysis(outcome: RoundOutcome, signal: AbortSignal): Promise<Result<AiDeepAnalysisResult, string>>;
  generateThemedChallenge(
    themePrompt: string,
    region: string,
    roundCount: ChallengeRoundCountOption,
    candidates: readonly ChallengeCandidateSummary[],
    signal: AbortSignal,
  ): Promise<Result<AiThemedChallengeResult, string>>;
  animateImageToVideo(
    request: AiAnimateVideoRequest,
    signal: AbortSignal,
  ): Promise<Result<AiAnimateVideoResult, string>>;
}

export interface ISoundEngine {
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  playPinDrop(): void;
  playHintUnlock(): void;
  playRoundScore(score: number): void;
  playVictoryFanfare(): void;
  playTimerTick(): void;
}
