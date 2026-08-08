create table if not exists public.collection_signal_values (
  id uuid primary key default gen_random_uuid(),
  collection_identity_id uuid not null
    references public.collection_identities(id) on delete cascade,
  signal_key text not null check (char_length(trim(signal_key)) > 0),
  calculation_version text not null check (char_length(trim(calculation_version)) > 0),
  signal_run_key text not null check (char_length(trim(signal_run_key)) > 0),
  numeric_value double precision null,
  structured_value jsonb null,
  computed_at timestamptz not null,
  source_window_start timestamptz null,
  source_window_end timestamptz null,
  completeness_status text not null
    check (completeness_status in ('complete', 'partial', 'unknown')),
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint collection_signal_values_signal_run_key_key unique (signal_run_key)
);

create index if not exists collection_signal_values_collection_signal_idx
  on public.collection_signal_values (collection_identity_id, signal_key);

create index if not exists collection_signal_values_collection_computed_idx
  on public.collection_signal_values (collection_identity_id, computed_at desc);

alter table public.collection_signal_values enable row level security;

revoke all on table public.collection_signal_values from anon, authenticated;
grant all on table public.collection_signal_values to service_role;
