# Collect Digital Profile Identity

## Root cause (PR18 correction)

Unapplied migrations previously defined:

```sql
profile_id uuid not null references auth.users(id)
```

Collect Digital authenticates with **Privy**, not Supabase Auth. Runtime code
resolved `profileId` to the Privy subject (`did:privy:…`), which cannot be
stored in a UUID column referencing `auth.users`. Real wallet registration and
verification would fail at insert time.

## Correct model

| Concept | Type | Role |
|---------|------|------|
| `privyUserId` | text (`did:privy:…`) | External auth identifier from verified JWT `sub` |
| `profileId` | uuid (`profiles.id`) | Internal Collect Digital identity used as FK |

Product tables (`profile_wallets`, `wallet_verification_challenges`, …) reference
`profiles(id)` only.

## Resolver

`src/lib/profiles/resolve-profile.ts` + `requireAuthenticatedProfile`:

1. Verify Privy access token
2. `getOrCreateByPrivyUserId(privyUserId)`
3. Return `AuthenticatedProfileContext { profileId: profiles.id }`

## Migration order (unapplied)

1. `20260725210000_create_profiles.sql`
2. `20260725214500_create_profile_wallets.sql`
3. `20260725220000_create_wallet_verification_challenges.sql`
4. `20260725223000_atomic_wallet_verification.sql`
5. `20260725230000_create_wallet_inventory.sql`
6. `20260725231000_create_provider_cache_entries.sql`

Do not apply these to a live project from this task — source correction only.
