import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  "supabase/migrations/20260807232500_create_collection_facts_foundation.sql"
);
const listedPctMigrationPath = path.resolve(
  "supabase/migrations/20260807235500_add_listed_pct_to_collection_market_snapshots.sql"
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8");
}

function listedPctMigrationSql(): string {
  return readFileSync(listedPctMigrationPath, "utf8");
}

test("collection facts migration creates required tables", () => {
  const sql = migrationSql();
  assert.match(sql, /create table if not exists public\.collection_identities/i);
  assert.match(sql, /create table if not exists public\.collection_identity_aliases/i);
  assert.match(sql, /create table if not exists public\.collection_market_snapshots/i);
  assert.match(sql, /create table if not exists public\.collection_sales_events/i);
  assert.match(sql, /create table if not exists public\.collection_trait_snapshots/i);
  assert.match(sql, /create table if not exists public\.collection_fact_sync_runs/i);
});

test("collection facts migration includes required uniqueness constraints", () => {
  const sql = migrationSql();
  assert.match(
    sql,
    /constraint collection_identities_canonical_id_key\s+unique \(canonical_id\)/i
  );
  assert.match(
    sql,
    /constraint collection_identities_chain_contract_key\s+unique \(chain_namespace, contract_address\)/i
  );
  assert.match(
    sql,
    /constraint collection_identity_aliases_provider_alias_key\s+unique \(provider, alias_kind, normalized_alias_value\)/i
  );
  assert.match(
    sql,
    /constraint collection_market_snapshots_observation_key\s+unique \(collection_identity_id, source_provider, observed_at\)/i
  );
  assert.match(
    sql,
    /constraint collection_sales_events_event_id_key unique \(event_id\)/i
  );
  assert.match(
    sql,
    /create unique index if not exists collection_sales_events_tx_log_unique_idx/i
  );
  assert.match(
    sql,
    /constraint collection_trait_snapshots_observation_key\s+unique \(collection_identity_id, source_provider, observed_at\)/i
  );
});

test("collection facts migration declares foreign keys to canonical identity", () => {
  const sql = migrationSql();
  assert.match(
    sql,
    /collection_identity_id uuid not null\s+references public\.collection_identities\(id\) on delete cascade/i
  );
});

test("collection facts migration includes expected indexes for query paths", () => {
  const sql = migrationSql();
  assert.match(
    sql,
    /create index if not exists collection_market_snapshots_collection_observed_idx/i
  );
  assert.match(
    sql,
    /create index if not exists collection_sales_events_collection_sold_at_idx/i
  );
  assert.match(
    sql,
    /create index if not exists collection_trait_snapshots_collection_observed_idx/i
  );
  assert.match(
    sql,
    /create index if not exists collection_fact_sync_runs_provider_started_idx/i
  );
});

test("collection facts migration applies server-only table access model", () => {
  const sql = migrationSql();
  assert.match(sql, /alter table public\.collection_identities enable row level security;/i);
  assert.match(sql, /alter table public\.collection_sales_events enable row level security;/i);
  assert.match(sql, /revoke all on table public\.collection_trait_snapshots from anon, authenticated;/i);
});

test("listed pct additive migration adds bounded listed_pct column", () => {
  const sql = listedPctMigrationSql();
  assert.match(
    sql,
    /alter table public\.collection_market_snapshots\s+add column if not exists listed_pct numeric null/i
  );
  assert.match(sql, /check \(listed_pct is null or \(listed_pct >= 0 and listed_pct <= 100\)\)/i);
});
