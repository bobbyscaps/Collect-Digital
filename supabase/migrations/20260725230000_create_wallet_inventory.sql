-- PR5: Verified Wallet Inventory Normalization
-- Persistence for normalized holdings and sync status only.
-- No scoring, rarity, valuation, or collector analysis.

create table if not exists public.wallet_holdings (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.profile_wallets(id) on delete cascade,
  chain_namespace text not null check (chain_namespace in ('eip155', 'solana')),
  contract_address text not null,
  token_id text not null,
  asset_standard text not null check (
    asset_standard in ('erc721', 'erc1155', 'spl_nft', 'unknown')
  ),
  quantity text not null,
  collection_id text null,
  owner_address text not null,
  acquired_at timestamptz null,
  last_seen_at timestamptz not null,
  source_provider text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_holdings_identity_key
    unique (wallet_id, chain_namespace, contract_address, token_id)
);

create index if not exists wallet_holdings_wallet_id_idx
  on public.wallet_holdings (wallet_id);

create index if not exists wallet_holdings_chain_namespace_idx
  on public.wallet_holdings (chain_namespace);

create index if not exists wallet_holdings_contract_address_idx
  on public.wallet_holdings (contract_address);

create table if not exists public.wallet_inventory_syncs (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.profile_wallets(id) on delete cascade,
  provider text not null,
  sync_status text not null check (
    sync_status in ('idle', 'running', 'success', 'failure')
  ),
  sync_started_at timestamptz not null,
  sync_completed_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_inventory_syncs_wallet_id_idx
  on public.wallet_inventory_syncs (wallet_id);

create index if not exists wallet_inventory_syncs_wallet_started_idx
  on public.wallet_inventory_syncs (wallet_id, sync_started_at desc);
