import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  "supabase/migrations/20260808001000_create_collection_signal_values.sql"
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8");
}

test("collection signals migration creates signal values table", () => {
  const sql = migrationSql();
  assert.match(sql, /create table if not exists public\.collection_signal_values/i);
});

test("collection signals migration enforces signal run key uniqueness", () => {
  const sql = migrationSql();
  assert.match(
    sql,
    /constraint collection_signal_values_signal_run_key_key unique \(signal_run_key\)/i
  );
});

test("collection signals migration defines foreign key to collection identities", () => {
  const sql = migrationSql();
  assert.match(
    sql,
    /collection_identity_id uuid not null\s+references public\.collection_identities\(id\) on delete cascade/i
  );
});

test("collection signals migration creates query indexes", () => {
  const sql = migrationSql();
  assert.match(
    sql,
    /create index if not exists collection_signal_values_collection_signal_idx/i
  );
  assert.match(
    sql,
    /create index if not exists collection_signal_values_collection_computed_idx/i
  );
});

test("collection signals migration applies server-only access", () => {
  const sql = migrationSql();
  assert.match(sql, /alter table public\.collection_signal_values enable row level security;/i);
  assert.match(sql, /revoke all on table public\.collection_signal_values from anon, authenticated;/i);
});
