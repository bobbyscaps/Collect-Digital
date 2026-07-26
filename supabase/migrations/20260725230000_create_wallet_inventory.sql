-- PR5: Verified Wallet Inventory Normalization
-- Persistence for normalized holdings and sync status only.
-- No scoring, rarity, valuation, or collector analysis.

create table if not exists public.wallet_holdings (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.profile_wallets(id) on delete cascade,
  chain_namespace text not null check (chain_namespace in ('eip155', 'solana')),
  contract_address text not null,
  token_id text not null,
  -- Free-form text so future standards/chains need no schema migration.
  -- Known values: erc721, erc1155, solana_nft, solana_pnft, unknown.
  asset_standard text not null,
  quantity text not null,
  -- Stable identity only: `${chain_namespace}:${contract_address}`.
  -- Never a provider catalog ID.
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
  duration_ms integer null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_inventory_syncs_wallet_id_idx
  on public.wallet_inventory_syncs (wallet_id);

create index if not exists wallet_inventory_syncs_wallet_started_idx
  on public.wallet_inventory_syncs (wallet_id, sync_started_at desc);

-- Server-only persistence: no PostgREST access for anon/authenticated.
alter table public.wallet_holdings enable row level security;
alter table public.wallet_inventory_syncs enable row level security;
revoke all on table public.wallet_holdings from anon, authenticated;
revoke all on table public.wallet_inventory_syncs from anon, authenticated;

-- Atomic inventory snapshot replacement for one wallet.
-- Upserts changed rows, skips unchanged content, deletes stale identities.
create or replace function public.replace_wallet_inventory(
  p_wallet_id uuid,
  p_holdings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  holding jsonb;
  v_written integer := 0;
  v_removed integer := 0;
  v_keep_keys text[] := array[]::text[];
  v_identity text;
  v_existing public.wallet_holdings%rowtype;
  v_now timestamptz := now();
begin
  if p_holdings is null or jsonb_typeof(p_holdings) <> 'array' then
    raise exception 'p_holdings must be a JSON array';
  end if;

  for holding in select value from jsonb_array_elements(p_holdings)
  loop
    if (holding->>'walletId')::uuid <> p_wallet_id then
      raise exception 'holding walletId does not match replace target';
    end if;

    v_identity := concat_ws(
      ':',
      holding->>'walletId',
      holding->>'chainNamespace',
      holding->>'contractAddress',
      holding->>'tokenId'
    );
    v_keep_keys := array_append(v_keep_keys, v_identity);

    select * into v_existing
    from public.wallet_holdings h
    where h.wallet_id = p_wallet_id
      and h.chain_namespace = holding->>'chainNamespace'
      and h.contract_address = holding->>'contractAddress'
      and h.token_id = holding->>'tokenId';

    if found then
      if v_existing.asset_standard is not distinct from holding->>'assetStandard'
        and v_existing.quantity is not distinct from holding->>'quantity'
        and v_existing.collection_id is not distinct from nullif(holding->>'collectionId', '')
        and v_existing.owner_address is not distinct from holding->>'ownerAddress'
        and v_existing.acquired_at is not distinct from nullif(holding->>'acquiredAt', '')::timestamptz
        and v_existing.source_provider is not distinct from holding->>'sourceProvider'
      then
        -- Unchanged content: no timestamp churn.
        continue;
      end if;

      update public.wallet_holdings
      set
        asset_standard = holding->>'assetStandard',
        quantity = holding->>'quantity',
        collection_id = nullif(holding->>'collectionId', ''),
        owner_address = holding->>'ownerAddress',
        acquired_at = nullif(holding->>'acquiredAt', '')::timestamptz,
        last_seen_at = (holding->>'lastSeenAt')::timestamptz,
        source_provider = holding->>'sourceProvider',
        updated_at = v_now
      where id = v_existing.id;
      v_written := v_written + 1;
    else
      insert into public.wallet_holdings (
        wallet_id,
        chain_namespace,
        contract_address,
        token_id,
        asset_standard,
        quantity,
        collection_id,
        owner_address,
        acquired_at,
        last_seen_at,
        source_provider,
        created_at,
        updated_at
      ) values (
        p_wallet_id,
        holding->>'chainNamespace',
        holding->>'contractAddress',
        holding->>'tokenId',
        holding->>'assetStandard',
        holding->>'quantity',
        nullif(holding->>'collectionId', ''),
        holding->>'ownerAddress',
        nullif(holding->>'acquiredAt', '')::timestamptz,
        (holding->>'lastSeenAt')::timestamptz,
        holding->>'sourceProvider',
        v_now,
        v_now
      );
      v_written := v_written + 1;
    end if;
  end loop;

  with deleted as (
    delete from public.wallet_holdings h
    where h.wallet_id = p_wallet_id
      and concat_ws(
        ':',
        h.wallet_id::text,
        h.chain_namespace,
        h.contract_address,
        h.token_id
      ) <> all (v_keep_keys)
    returning 1
  )
  select count(*)::integer into v_removed from deleted;

  return jsonb_build_object(
    'writtenCount', v_written,
    'removedCount', coalesce(v_removed, 0)
  );
end;
$$;

-- Privileged server-only execution (matches complete_wallet_ownership_verification).
revoke all on function public.replace_wallet_inventory(uuid, jsonb)
  from public;
revoke all on function public.replace_wallet_inventory(uuid, jsonb)
  from anon, authenticated;
grant execute on function public.replace_wallet_inventory(uuid, jsonb)
  to service_role;
