create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  username text unique,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  address text not null unique,
  chain text not null default 'ethereum',
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  chain text not null default 'ethereum',
  contract_address text,
  image_url text,
  banner_url text,
  opensea_url text not null,
  official_website text,
  x_url text,
  discord_url text,
  telegram_url text,
  founded_at timestamptz,
  founder_names text[] default '{}',
  has_token boolean not null default false,
  has_reward_platform boolean not null default false,
  has_irl_events boolean not null default false,
  has_business_revenue boolean not null default false,
  has_dev_founder boolean not null default false,
  data_confidence_level text not null default 'auto_generated' check (
    data_confidence_level in ('auto_generated', 'community_funded', 'claimed', 'verified', 'full_evaluation')
  ),
  is_claimed boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  floor_price_eth numeric(18, 8) not null default 0,
  floor_change_24h_pct numeric(8, 3) not null default 0,
  volume_24h_eth numeric(18, 8) not null default 0,
  volume_7d_eth numeric(18, 8) not null default 0,
  sales_24h integer not null default 0,
  holder_count integer not null default 0,
  unique_owner_pct numeric(8, 3) not null default 0,
  listed_count integer not null default 0,
  listed_pct numeric(8, 3) not null default 0,
  top_offer_eth numeric(18, 8) not null default 0,
  bid_depth_eth numeric(18, 8) not null default 0,
  whale_concentration_pct numeric(8, 3),
  source text not null default 'opensea',
  captured_at timestamptz not null default now()
);

create index if not exists idx_collection_market_snapshots_collection_id_captured_at
  on public.collection_market_snapshots (collection_id, captured_at desc);

create table if not exists public.collection_social_metrics (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  x_posts_7d integer not null default 0,
  discord_messages_7d integer not null default 0,
  telegram_messages_7d integer not null default 0,
  pfp_usage_count integer not null default 0,
  founder_influence_score numeric(8, 3) not null default 0,
  holder_retention_pct numeric(8, 3) not null default 0,
  reward_frequency_score numeric(8, 3) not null default 0,
  engagement_quality_score numeric(8, 3) not null default 0,
  captured_at timestamptz not null default now()
);

create table if not exists public.collection_wiki_entries (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  title text not null,
  content text not null,
  revision_number integer not null default 1,
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_timeline_events (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  event_date date not null,
  title text not null,
  description text not null,
  source_url text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_upgrade_campaigns (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  target_usd integer not null default 500,
  raised_usd integer not null default 0,
  contributor_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'funded', 'closed')),
  funded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_contributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.collection_upgrade_campaigns(id) on delete cascade,
  contributor_user_id uuid references public.users(id) on delete set null,
  contributor_wallet_id uuid references public.wallets(id) on delete set null,
  stripe_payment_intent_id text,
  amount_usd integer not null,
  badge_awarded text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_claims (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  requested_by_user_id uuid references public.users(id) on delete set null,
  requested_by_wallet_id uuid references public.wallets(id) on delete set null,
  evidence text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_scores (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  scoring_model_id text not null,
  scoring_version_id uuid,
  overall_score numeric(8, 3) not null,
  confidence_score numeric(8, 3) not null,
  market_health_score numeric(8, 3) not null default 0,
  liquidity_score numeric(8, 3) not null default 0,
  community_strength_score numeric(8, 3) not null default 0,
  builder_team_score numeric(8, 3) not null default 0,
  product_utility_score numeric(8, 3) not null default 0,
  culture_art_brand_score numeric(8, 3) not null default 0,
  holder_value_rewards_score numeric(8, 3) not null default 0,
  skin_in_the_game_score numeric(8, 3) not null default 0,
  explainability jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

create index if not exists idx_collection_scores_collection_id_computed_at
  on public.collection_scores (collection_id, computed_at desc);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete set null,
  contract_address text not null,
  token_id text not null,
  quantity integer not null default 1,
  acquired_at timestamptz,
  acquired_price_eth numeric(18, 8),
  latest_floor_eth numeric(18, 8),
  latest_best_offer_eth numeric(18, 8),
  updated_at timestamptz not null default now(),
  unique (wallet_id, contract_address, token_id)
);

create table if not exists public.wallet_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  optimistic_value_eth numeric(18, 8) not null default 0,
  conservative_value_eth numeric(18, 8) not null default 0,
  floor_to_offer_gap_eth numeric(18, 8) not null default 0,
  unrealized_pnl_eth numeric(18, 8),
  collector_score numeric(8, 3),
  flipper_score numeric(8, 3),
  wallet_identity text,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,
  alert_type text not null,
  title text not null,
  description text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  badge_type text not null check (badge_type in ('collector', 'flipper', 'contributor', 'project')),
  created_at timestamptz not null default now()
);

create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  event_type text not null,
  points integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scoring_models (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.scoring_versions (
  id uuid primary key default gen_random_uuid(),
  scoring_model_id uuid not null references public.scoring_models(id) on delete cascade,
  model_id text not null,
  model_name text not null,
  version_name text not null,
  description text,
  is_active boolean not null default false,
  category_weights jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.scoring_weights (
  id uuid primary key default gen_random_uuid(),
  scoring_version_id uuid not null references public.scoring_versions(id) on delete cascade,
  category_key text not null,
  points numeric(8, 3) not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.scoring_factor_rules (
  id uuid primary key default gen_random_uuid(),
  scoring_version_id uuid not null references public.scoring_versions(id) on delete cascade,
  key text not null,
  label text not null,
  category text not null,
  enabled boolean not null default true,
  weight numeric(8, 4) not null default 0,
  source_metric text not null,
  normalization text not null,
  min_value numeric(18, 8),
  max_value numeric(18, 8),
  cap numeric(18, 8),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scoring_runs (
  id uuid primary key default gen_random_uuid(),
  scoring_model_id uuid references public.scoring_models(id) on delete set null,
  scoring_version_id uuid references public.scoring_versions(id) on delete set null,
  collection_id uuid references public.collections(id) on delete set null,
  run_mode text not null default 'live' check (run_mode in ('live', 'simulation', 'backtest')),
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  delta_vs_baseline numeric(8, 3),
  created_at timestamptz not null default now()
);

alter table public.collection_wiki_entries enable row level security;
alter table public.collection_timeline_events enable row level security;
alter table public.project_claims enable row level security;

drop policy if exists "public read wiki entries" on public.collection_wiki_entries;
create policy "public read wiki entries"
on public.collection_wiki_entries for select
using (true);

drop policy if exists "authenticated write wiki entries" on public.collection_wiki_entries;
create policy "authenticated write wiki entries"
on public.collection_wiki_entries for insert
to authenticated
with check (true);
