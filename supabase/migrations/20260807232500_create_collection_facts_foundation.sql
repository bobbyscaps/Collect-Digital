-- PR1: MVP Collection Facts Foundation
-- Facts + persistence + repository contracts only.
-- No score formulas or signal calculations in this migration.

create extension if not exists pgcrypto;

create table if not exists public.collection_identities (
  id uuid primary key default gen_random_uuid(),
  chain_namespace text not null,
  contract_address text not null,
  canonical_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_identities_canonical_id_key unique (canonical_id),
  constraint collection_identities_chain_contract_key
    unique (chain_namespace, contract_address)
);

create index if not exists collection_identities_chain_namespace_idx
  on public.collection_identities (chain_namespace);

create table if not exists public.collection_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  collection_identity_id uuid not null
    references public.collection_identities(id) on delete cascade,
  provider text not null,
  alias_kind text not null check (alias_kind in ('slug', 'provider_id', 'contract_alias')),
  alias_value text not null,
  normalized_alias_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_identity_aliases_provider_alias_key
    unique (provider, alias_kind, normalized_alias_value)
);

create index if not exists collection_identity_aliases_collection_identity_id_idx
  on public.collection_identity_aliases (collection_identity_id);

create table if not exists public.collection_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  collection_identity_id uuid not null
    references public.collection_identities(id) on delete cascade,
  source_provider text not null,
  source_endpoint text null,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  completeness_status text not null
    check (completeness_status in ('complete', 'partial', 'unknown')),
  floor_price_native numeric null,
  top_offer_native numeric null,
  near_floor_offer_value_native numeric null,
  active_offer_count integer null check (active_offer_count is null or active_offer_count >= 0),
  active_listing_count integer null check (active_listing_count is null or active_listing_count >= 0),
  total_supply numeric null check (total_supply is null or total_supply >= 0),
  holder_count integer null check (holder_count is null or holder_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_market_snapshots_observation_key
    unique (collection_identity_id, source_provider, observed_at)
);

create index if not exists collection_market_snapshots_collection_observed_idx
  on public.collection_market_snapshots (collection_identity_id, observed_at desc);

create index if not exists collection_market_snapshots_provider_observed_idx
  on public.collection_market_snapshots (source_provider, observed_at desc);

create table if not exists public.collection_sales_events (
  id uuid primary key default gen_random_uuid(),
  collection_identity_id uuid not null
    references public.collection_identities(id) on delete cascade,
  event_id text not null,
  source_sale_id text null,
  source_provider text not null,
  source_endpoint text null,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  completeness_status text not null
    check (completeness_status in ('complete', 'partial', 'unknown')),
  chain_namespace text not null,
  contract_address text not null,
  token_id text not null,
  transaction_hash text null,
  log_index integer null,
  event_index integer null,
  buyer_address text null,
  seller_address text null,
  price_currency text null,
  price_amount_native numeric null,
  price_amount_usd numeric null,
  sold_at timestamptz not null,
  marketplace text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_sales_events_event_id_key unique (event_id)
);

create unique index if not exists collection_sales_events_tx_log_unique_idx
  on public.collection_sales_events (chain_namespace, transaction_hash, log_index)
  where transaction_hash is not null and log_index is not null;

create index if not exists collection_sales_events_collection_sold_at_idx
  on public.collection_sales_events (collection_identity_id, sold_at desc);

create index if not exists collection_sales_events_provider_sold_at_idx
  on public.collection_sales_events (source_provider, sold_at desc);

create table if not exists public.collection_trait_snapshots (
  id uuid primary key default gen_random_uuid(),
  collection_identity_id uuid not null
    references public.collection_identities(id) on delete cascade,
  source_provider text not null,
  source_endpoint text null,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  completeness_status text not null
    check (completeness_status in ('complete', 'partial', 'unknown')),
  trait_category_count integer null check (trait_category_count is null or trait_category_count >= 0),
  distinct_trait_value_count integer null check (distinct_trait_value_count is null or distinct_trait_value_count >= 0),
  reported_supply numeric null check (reported_supply is null or reported_supply >= 0),
  one_of_one_asset_count integer null check (one_of_one_asset_count is null or one_of_one_asset_count >= 0),
  one_of_one_supply_pct numeric null
    check (one_of_one_supply_pct is null or (one_of_one_supply_pct >= 0 and one_of_one_supply_pct <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_trait_snapshots_observation_key
    unique (collection_identity_id, source_provider, observed_at)
);

create index if not exists collection_trait_snapshots_collection_observed_idx
  on public.collection_trait_snapshots (collection_identity_id, observed_at desc);

create table if not exists public.collection_fact_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null,
  source_endpoint text null,
  sync_scope text not null default 'collection_facts',
  sync_status text not null check (sync_status in ('running', 'success', 'failure')),
  sync_started_at timestamptz not null,
  sync_completed_at timestamptz null,
  duration_ms integer null,
  error_message text null,
  error_metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collection_fact_sync_runs_provider_started_idx
  on public.collection_fact_sync_runs (source_provider, sync_started_at desc);

-- Server-only persistence for Collection Facts.
alter table public.collection_identities enable row level security;
alter table public.collection_identity_aliases enable row level security;
alter table public.collection_market_snapshots enable row level security;
alter table public.collection_sales_events enable row level security;
alter table public.collection_trait_snapshots enable row level security;
alter table public.collection_fact_sync_runs enable row level security;

revoke all on table public.collection_identities from anon, authenticated;
revoke all on table public.collection_identity_aliases from anon, authenticated;
revoke all on table public.collection_market_snapshots from anon, authenticated;
revoke all on table public.collection_sales_events from anon, authenticated;
revoke all on table public.collection_trait_snapshots from anon, authenticated;
revoke all on table public.collection_fact_sync_runs from anon, authenticated;
