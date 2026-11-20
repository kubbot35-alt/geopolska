# GeoPolska Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Zero-Trust Default Deny**: Every unmapped Firestore path is denied for both read and write.
2. **Verified Identity**: All writes require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Owner Isolation (PII & History)**: `users/{userId}` and `games/{gameId}` can only be read by the matching `request.auth.uid`. `users` prohibits `list` operations entirely.
4. **Public Leaderboard Integrity**: `leaderboard/{userId}` and `dailyLeaderboard/{entryId}` contain zero PII (no email, phone, or address), allow public read/list strictly bounded by valid score invariants, and allow writes only to `request.auth.uid == userId`.
5. **Score & Array Bounds**: `bestScore` on global leaderboard and `score` on daily leaderboard are strictly bounded to `[0, 25000]`. `games/{gameId}` supports `roundsCount in [3, 5, 10, 15, 20]` with `totalScore <= roundsCount * 5000` and bounded arrays matching `roundsCount` (max 20).
6. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on create and remain immutable on update. `games/{gameId}` and `dailyLeaderboard/{entryId}` records are append-only (no client update or delete).
7. **Relational Existence**: Creating a `games/{gameId}`, `leaderboard/{userId}`, or `dailyLeaderboard/{entryId}` record verifies that `/users/$(request.auth.uid)` exists.
8. **Admin-Only Location Catalog Governance**: `/locations/{locationId}` and `/catalogMeta/{catalogId}` contain zero PII and allow public reads strictly constrained by `catalogKey == 'poland'` (for `locations`) and `version >= 1` (for `catalogMeta`). All `create`, `update`, and `delete` operations on `/locations` and `/catalogMeta` are restricted strictly to verified administrators (`isAdmin()`).
9. **Geographic & Schema Bounds on Locations**: Every `/locations/{locationId}` document must satisfy Poland WGS84 coordinate bounds (`48.5 <= lat <= 55.5`, `13.5 <= lng <= 25.0`), allowed `regionCategory` enum (`miasto`, `gory`, `morze`, `zabytek`, `nad_woda`), bounded string lengths, and `id == locationId`.

## 2. The Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Identity Spoofing on Profile Create**: User `alice` writes `/users/bob` with `uid: "bob"`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` creates `/users/alice` or writes `/locations/warszawa` with spoofed admin email.
3. **Shadow / Ghost Field Injection**: User `alice` creates `/users/alice` with extra field `isAdmin: true`, or admin writes `/locations/test` with extra field `secret: "x"`.
4. **Score Inflation Attack**: User `alice` writes `/leaderboard/alice` with `bestScore: 999999`.
5. **Cross-User Game History Read**: User `alice` runs `get` or `list` on `/games` without filtering `uid == "alice"`.
6. **History Tampering Attack**: User `alice` attempts `update` on existing `/games/game_123` to raise `totalScore`.
7. **ID Poisoning Attack**: Attacker attempts to create `/locations/..%2Fbad$id` or a 200-char ID.
8. **Timestamp Forgery**: User or admin submits a client-forged `createdAt` or `updatedAt` timestamp instead of `serverTimestamp()`.
9. **Immutable Field Mutation**: Admin updates `/locations/warszawa` attempting to alter `createdAt` or `id`, or user updates `/leaderboard/alice` altering `uid`.
10. **Non-Admin Catalog Write**: Regular verified user `bob` attempts `create`, `update`, or `delete` on `/locations/warszawa` or `/catalogMeta/poland`.
11. **Out-of-Bounds Location Coordinates / Oversized Strings**: Admin writes `/locations/bad_coord` with `lat: 10.0` (outside Poland) or a 2,000-character `hint`.
12. **Unfiltered Catalog List / Admin Escalation**: Attacker runs `list` on `/catalogMeta` (forbidden), `list` on `/locations` without `catalogKey == 'poland'`, or creates `/admins/{uid}` to self-grant admin role.
