# Collector Identity (PR8)

PR8 replaces the mock collector profile with a **real Collector Identity** powered
by the PR1–PR7 backend stack. Collect Digital is a platform built on trust:
**never display fabricated data**.

## Architecture

```
Privy Bearer token
        │
        ▼
requireAuthenticatedProfile ──► AuthenticatedProfileContext.profileId
        │
        ▼
CollectorIdentityService (section assembler)
        ├── ProfileWalletRepository          (live verification)
        ├── CollectorAnalysisService         (inventory / collections)
        └── WalletInventoryRepository        (stale fallback reads)
        │
        ▼
GET /api/collector-identity/me  ── typed API models only
        │
        ▼
fetchMyCollectorIdentity (frontend client)
        │
        ▼
ProgressiveData + profile UI sections
```

Boundaries:

- **Authenticated users only** for `/api/collector-identity/me`.
- `profileId` is derived from the verified Privy JWT subject. Client-supplied
  profile IDs are never trusted.
- The API returns **typed transport models**. It never exposes repositories,
  provider payloads, or domain service instances.
- Each identity section owns its own lifecycle. One unavailable section must
  never prevent the rest of the identity from rendering.

## Progressive data-state pattern

Every section is wrapped in a progressive envelope:

| State | Meaning |
|-------|---------|
| `loading` | Request in flight |
| `live` | Current real data |
| `stale` | Last successfully persisted real data; live refresh unavailable |
| `empty` | No real data yet (valid state) |
| `partial` | Some real data available; some wallets/sources still missing |
| `error` | Section failed and no usable persisted fallback exists |
| `coming_soon` | Feature not implemented — never substitute fake numbers |

UI modules must render through `ProgressiveData`
(`src/components/collector-identity/progressive-data.tsx`). Future profile
modules (achievements, scores, communities) reuse the same component.

## Dynamic status vs permanent achievements

### Status (Dynamic)

Current information that may change over time:

- wallet verification
- inventory freshness
- Collector Score (future)
- Collection Scores (future)
- portfolio metrics (future)
- communities / followers / following (future)

Dynamic status always represents the collector's **present** state.
Wallet verification is never served from a stale snapshot.

### Achievements (Permanent)

Achievements are earned once and remain part of collector history even if later
status changes. PR8 reserves the Achievements section as **Coming Soon** and
defines future metadata (`achievementId`, `badgeId`, `badgeName`, `icon`,
`description`, `earnedAt`, `awardedBy`, `rulesVersion`, optional `rarity`,
`displayOrder`, `permanent`) without persistence or awarding.

## Stale data policy

When live data cannot be refreshed but previously persisted real data exists:

1. Display the last successful value.
2. Mark the section `stale`.
3. Show the last-updated timestamp.

Never fall back to fabricated values.

**Exception:** wallet verification always reflects the current registry status.

## Public API contract

### `GET /api/collector-identity/me`

**Auth:** `Authorization: Bearer <Privy access token>`

**Success (200):** `CollectorIdentityResponse`

| Field | Description |
|-------|-------------|
| `schemaVersion` | `1` |
| `profileId` | Trusted profile id from auth |
| `identity` | Progressive section: displayName / avatarUrl / bio |
| `wallets` | Progressive section: verified wallets + latest sync |
| `inventory` | Progressive section: collections / unique tokens / quantity / status |
| `collectionSummaries` | Progressive section: per-collection summaries |
| `statusModules` | Dynamic modules currently `coming_soon` |
| `achievements` | Permanent achievements currently `coming_soon` |

**Errors:**

| Status | Code | When |
|--------|------|------|
| 401 | `authentication_required` / `invalid_token` | Missing or invalid Bearer token |
| 503 | `service_unavailable` | Persistence wiring unavailable |
| 500 | `internal_error` | Unexpected failure |

Unauthenticated callers never receive identity payloads.

Frontend client: `fetchMyCollectorIdentity` in
`src/lib/collector-identity/client.ts` (typed responses + typed errors).

## UI integration

The existing profile layout (banner, avatar, tabs, spacing, cards) is preserved.

Header metrics now show only real-backed signals:

- Verified Wallets
- Collections
- Unique Tokens
- Inventory Status
- Latest Sync

Unsupported modules (scores, followers, communities, activity sample feeds,
NFT gallery, marketplace enrichment) display **Coming Soon**.

Search remains unchanged and is out of scope for this identity integration.

## Related: PR9 wallet verification flow

Wallet registration, ownership verification, and first inventory sync are
documented in `docs/wallet-registration-verification-sync.md`.

## Out of scope (do not begin PR10)

- Collector Scores / Collection Scores implementation
- Marketplace enrichment
- NFT gallery
- Achievement persistence/awarding
- Public third-party profile identity (this endpoint is `/me` only)

## Core product principle

When data exists: display the current real value.

When only previously persisted real data exists: display the last known value,
clearly marked stale with a last-updated timestamp.

When a feature is not implemented: display Coming Soon — never placeholder
numbers or fake metrics.
