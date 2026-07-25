-- PR3: Chain-Aware Verified Wallet Registry
-- Persistence model only. No runtime auth/score behavior changes.

create extension if not exists pgcrypto;

create table if not exists public.profile_wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  chain_namespace text not null check (chain_namespace in ('eip155', 'solana')),
  address text not null,
  normalized_address text not null,
  role text not null check (role in ('login', 'primary', 'connected')),
  verification_status text not null check (verification_status in ('pending', 'verified', 'revoked')),
  verified_at timestamptz null,
  disconnected_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_wallets_chain_namespace_normalized_address_key
    unique (chain_namespace, normalized_address)
);

create index if not exists profile_wallets_profile_id_idx
  on public.profile_wallets (profile_id);
