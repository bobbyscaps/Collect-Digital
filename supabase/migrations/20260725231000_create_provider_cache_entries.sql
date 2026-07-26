-- Provider response cache used by src/lib/providers/cache.ts.
-- Server-side persistence only — no fabricated cache rows.

create table if not exists public.provider_cache_entries (
  cache_key text primary key,
  provider text not null,
  value jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists provider_cache_entries_provider_idx
  on public.provider_cache_entries (provider);

create index if not exists provider_cache_entries_expires_at_idx
  on public.provider_cache_entries (expires_at);

comment on table public.provider_cache_entries is
  'TTL cache for provider adapter responses. Upserted by server via service_role.';
