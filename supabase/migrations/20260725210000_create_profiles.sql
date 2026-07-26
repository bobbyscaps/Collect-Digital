-- Collect Digital internal profile identity (Privy ↔ UUID mapping).
-- Privy remains the authentication provider. Supabase is persistence only.
-- Do NOT reference auth.users — Collect Digital does not use Supabase Auth.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_privy_user_id_key unique (privy_user_id)
);

create index if not exists profiles_privy_user_id_idx
  on public.profiles (privy_user_id);

comment on table public.profiles is
  'Internal Collect Digital profile. Maps Privy DID (privy_user_id) to UUID primary key used by product tables.';

comment on column public.profiles.privy_user_id is
  'Trusted Privy JWT subject (e.g. did:privy:...). External auth identifier only — never a foreign key target for product data.';

-- Server-only persistence: no PostgREST access for anon/authenticated.
-- service_role bypasses RLS (Collect Digital APIs use the service role after Privy auth).
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
