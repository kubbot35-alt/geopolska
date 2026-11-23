# GeoPolska Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Zero-Trust Default Deny**: Every unmapped Firestore path is denied for both read and write.
2. **Verified Identity for Authenticated Collections**: All writes to `users`, `games`, `leaderboard`, `dailyLeaderboard`, `locations`, `catalogMeta`, and `authenticated` entries in `rankings` require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Owner Isolation (PII & History)**: `users/{userId}` and `games/{gameId}` can only be read by the matching `request.auth.uid`. `users` prohibits `list` operations entirely.
4. **Unified Public Rankings Table (`/rankings/{rankingId}`)**: Supports both Google-authenticated players (`playerType == 'authenticated'`) and unauthenticated guests (`playerType == 'guest'`). Contains zero PII (`photoUrl == ''` for guests). Enforces deterministic per-mode document IDs (`auth_{uid}_standard`, `auth_{uid}_daily_{YYYY-MM-DD}`, `guest_{guestId}_standard`, `guest_{guestId}_daily_{YYYY-MM-DD}`) so each player maintains separate records for standard mode and Daily Challenge.
5. **Cross-Type Hijack Prevention on `/rankings`**: Guests can NEVER create or update a document with `playerType == 'authenticated'`, nor mutate an existing `authenticated` document. Daily Challenge entries (`gameMode == 'daily'`) are immutable after creation (one official record per actor per day). Deletion of ranking entries is forbidden for all clients.
6. **Score & Array Bounds**: `bestScore` is strictly bounded to `[0, 25000]`. `rawScore <= roundsCount * 5000` (max `500000`) and `roundLocations`/`roundScores`/`roundDistances` are bounded to `<= 100` elements matching `roundsCount in [3, 5, 10, 15, 20, 30, 50, 100]`. Guest nicknames are strictly bounded to `[2, 30]` characters; authenticated display names to `[1, 60]` characters.
7. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on create and remain immutable on update. `updatedAt` must equal `request.time` on both create and update.
8. **Admin-Only Location Catalog Governance**: `/locations/{locationId}` and `/catalogMeta/{catalogId}` are admin-writable only (`isAdmin()`) with strict Poland WGS84 coordinate bounds.

## 2. The Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Identity Spoofing on Authenticated Ranking**: User `alice` writes `/rankings/auth_bob_standard` with `actorId: "bob"`, `playerType: "authenticated"`.
2. **Guest Hijacking Authenticated Record**: Unauthenticated guest attempts `update` on existing `/rankings/auth_alice_standard` or creates `playerType: "authenticated"`.
3. **Shadow / Ghost Field Injection**: Guest creates `/rankings/guest_abc_standard` with extra field `isAdmin: true` or `email: "a@b.com"`.
4. **Score Inflation Attack**: Guest or user writes `/rankings/guest_abc_standard` with `bestScore: 999999` or `rawScore: 50000` for `roundsCount: 5`.
5. **Daily Challenge Overwrite Attack**: Guest or user attempts `update` on existing `/rankings/guest_abc_daily_2026-11-20` to replace their first daily score.
6. **ID Mismatch / ID Poisoning Attack**: Guest writes `/rankings/custom_bad_id` that does not match `guest_{actorId}_standard` or contains illegal characters.
7. **Timestamp Forgery**: Guest submits a client-forged `createdAt` or `updatedAt` timestamp instead of `serverTimestamp()`.
8. **Immutable Field Mutation on Update**: Guest updates `/rankings/guest_abc_standard` trying to alter `playerType`, `actorId`, `gameMode`, `dateKey`, or `createdAt`.
9. **Guest Photo / PII Injection**: Guest submits non-empty `photoUrl: "https://evil.test/x.png"` on a `playerType: "guest"` entry.
10. **Oversized Nickname Poisoning**: Guest submits a 200-character `playerName` or a 1-character nickname.
11. **Ranking Deletion Attack**: Any user or guest attempts `delete` on `/rankings/{rankingId}`.
12. **Unfiltered Scraping / Non-Admin Location Write**: Client attempts `list` on `/rankings` without valid `dateKey` filter, or non-admin writes `/locations/warszawa`.
