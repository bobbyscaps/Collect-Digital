-- PR4: Verified Wallet Ownership
-- Challenge persistence only. No holdings ingestion or scoring behavior.
-- profile_id references Collect Digital profiles(id), not auth.users.

create extension if not exists pgcrypto;

create table if not exists public.wallet_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  wallet_id uuid not null references public.profile_wallets(id) on delete cascade,
  nonce text not null,
  chain_namespace text not null check (chain_namespace in ('eip155', 'solana')),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint wallet_verification_challenges_nonce_key unique (nonce)
);

create index if not exists wallet_verification_challenges_wallet_id_idx
  on public.wallet_verification_challenges (wallet_id);

create index if not exists wallet_verification_challenges_profile_id_idx
  on public.wallet_verification_challenges (profile_id);

create index if not exists wallet_verification_challenges_expires_at_idx
  on public.wallet_verification_challenges (expires_at);

-- Server-only persistence: no PostgREST access for anon/authenticated.
alter table public.wallet_verification_challenges enable row level security;
revoke all on table public.wallet_verification_challenges from anon, authenticated;
