-- PR2: Preserve provider-listed percentage as a first-class market fact.
-- Additive migration only.

alter table public.collection_market_snapshots
  add column if not exists listed_pct numeric null
  check (listed_pct is null or (listed_pct >= 0 and listed_pct <= 100));
