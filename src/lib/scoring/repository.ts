import { promises as fs } from "node:fs";
import path from "node:path";

import { DEFAULT_SCORING_VERSION, MOCK_SCORING_VERSIONS } from "@/lib/mock-data";
import type { ScoringModelVersion } from "@/lib/types";

/**
 * Scoring version store.
 *
 * Persists formula versions to a local JSON file so admins can save and activate
 * new formulas from the Score Lab. The async signatures are intentionally kept so
 * this can be swapped for a real database (e.g. Supabase) later without touching
 * callers.
 *
 * NOTE: The file store persists across local restarts but not on read-only
 * serverless filesystems (e.g. Vercel). Swap in a DB-backed implementation for
 * production.
 */

type ScoringStore = {
  versions: ScoringModelVersion[];
  activeId: string;
};

const DATA_DIR = path.join(process.cwd(), ".scoring-data");
const DATA_FILE = path.join(DATA_DIR, "versions.json");

let cache: ScoringStore | null = null;

function seedStore(): ScoringStore {
  const versions = MOCK_SCORING_VERSIONS.length
    ? MOCK_SCORING_VERSIONS
    : [DEFAULT_SCORING_VERSION];
  const active = versions.find((version) => version.isActive) ?? versions[0];
  return {
    versions: versions.map((version) => ({ ...version })),
    activeId: active.id,
  };
}

function isValidVersion(value: unknown): value is ScoringModelVersion {
  if (!value || typeof value !== "object") return false;
  const version = value as Partial<ScoringModelVersion>;
  return (
    typeof version.id === "string" &&
    typeof version.categoryWeights === "object" &&
    Array.isArray(version.factorRules)
  );
}

function isValidStore(value: unknown): value is ScoringStore {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<ScoringStore>;
  return (
    Array.isArray(store.versions) &&
    store.versions.every(isValidVersion) &&
    typeof store.activeId === "string"
  );
}

async function readStore(): Promise<ScoringStore> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (isValidStore(parsed) && parsed.versions.length > 0) {
      cache = parsed;
      return cache;
    }
  } catch {
    // File missing or unreadable — fall through to seed.
  }
  cache = seedStore();
  return cache;
}

async function writeStore(store: ScoringStore): Promise<void> {
  cache = store;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    // Read-only filesystems (serverless) will fail here; keep the in-memory
    // cache so the current process still reflects the change.
    console.error("Failed to persist scoring store", error);
  }
}

export async function listScoringVersions(): Promise<ScoringModelVersion[]> {
  const store = await readStore();
  return store.versions.map((version) => ({
    ...version,
    isActive: version.id === store.activeId,
  }));
}

export async function getActiveScoringModelVersion(): Promise<ScoringModelVersion> {
  const store = await readStore();
  const active = store.versions.find((version) => version.id === store.activeId);
  return active ?? DEFAULT_SCORING_VERSION;
}

function slugifyId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `version_${base || "custom"}_${Date.now().toString(36)}`;
}

/**
 * Create a new version (or update an existing one when `id` matches). Returns the
 * saved version. Does not change which version is active.
 */
export async function saveScoringVersion(
  input: ScoringModelVersion
): Promise<ScoringModelVersion> {
  const store = await readStore();
  const existingIndex = store.versions.findIndex((v) => v.id === input.id);

  const saved: ScoringModelVersion = {
    ...input,
    id: existingIndex >= 0 ? input.id : slugifyId(input.versionName || "custom"),
    createdAt:
      existingIndex >= 0
        ? store.versions[existingIndex].createdAt
        : new Date().toISOString(),
  };

  const versions =
    existingIndex >= 0
      ? store.versions.map((v, i) => (i === existingIndex ? saved : v))
      : [...store.versions, saved];

  await writeStore({ ...store, versions });
  return saved;
}

export async function setActiveScoringVersion(
  id: string
): Promise<ScoringModelVersion> {
  const store = await readStore();
  const target = store.versions.find((version) => version.id === id);
  if (!target) {
    throw new Error(`Scoring version not found: ${id}`);
  }
  await writeStore({ ...store, activeId: id });
  return { ...target, isActive: true };
}
