import { promises as fs } from "node:fs";
import path from "node:path";

import {
  COLLECTOR_SUB_SCORE_ORDER,
  COLLECTOR_SUB_SCORE_WEIGHTS,
  type CollectorSubScoreWeights,
} from "@/lib/scoring/wallet-collector";

/**
 * Active collector-formula weights store.
 *
 * Persists the tunable collector sub-score weights to a local JSON file so the
 * Collector Score Lab can save/activate a formula that drives real ratings.
 * Same caveat as the collection scoring store: the file persists locally but not
 * on read-only serverless filesystems — swap for a DB in production.
 */

const DATA_DIR = path.join(process.cwd(), ".scoring-data");
const DATA_FILE = path.join(DATA_DIR, "collector-weights.json");

let cache: CollectorSubScoreWeights | null = null;

function sanitize(input: unknown): CollectorSubScoreWeights | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const result = {} as CollectorSubScoreWeights;
  for (const key of COLLECTOR_SUB_SCORE_ORDER) {
    const value = Number(record[key]);
    if (!Number.isFinite(value) || value < 0) return null;
    result[key] = value;
  }
  return result;
}

export async function getActiveCollectorWeights(): Promise<CollectorSubScoreWeights> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = sanitize(JSON.parse(raw));
    if (parsed) {
      cache = parsed;
      return cache;
    }
  } catch {
    // Missing/unreadable — fall through to defaults.
  }
  cache = { ...COLLECTOR_SUB_SCORE_WEIGHTS };
  return cache;
}

export async function setActiveCollectorWeights(
  input: unknown
): Promise<CollectorSubScoreWeights> {
  const weights = sanitize(input);
  if (!weights) {
    throw new Error("Invalid collector weights payload.");
  }
  cache = weights;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(weights, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to persist collector weights", error);
  }
  return weights;
}
