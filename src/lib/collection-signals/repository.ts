import { randomUUID } from "node:crypto";

import type { CollectionFactCompletenessStatus } from "@/lib/collection-facts/domain";
import type {
  CollectionDerivedSignalKey,
  CollectionSignalValue,
} from "@/lib/collection-signals/domain";
import { toCollectionSignalRunKey } from "@/lib/collection-signals/domain";

export interface UpsertCollectionSignalValueInput {
  collectionIdentityId: string;
  signalKey: CollectionDerivedSignalKey;
  calculationVersion: string;
  numericValue?: number | null;
  structuredValue?: Record<string, unknown> | null;
  computedAt: string;
  sourceWindowStart?: string | null;
  sourceWindowEnd?: string | null;
  completenessStatus?: CollectionFactCompletenessStatus;
  metadata?: Record<string, unknown> | null;
}

export interface CollectionSignalRepository {
  upsertCollectionSignalValues(
    values: readonly UpsertCollectionSignalValueInput[]
  ): Promise<readonly CollectionSignalValue[]>;
  listCollectionSignalValues(
    collectionIdentityId: string,
    signalKeys?: readonly CollectionDerivedSignalKey[]
  ): Promise<readonly CollectionSignalValue[]>;
  listLatestCollectionSignalValues(
    collectionIdentityId: string
  ): Promise<readonly CollectionSignalValue[]>;
}

function freezeSignalValue(value: CollectionSignalValue): CollectionSignalValue {
  return Object.freeze({
    ...value,
    structuredValue: value.structuredValue ? { ...value.structuredValue } : null,
    metadata: value.metadata ? { ...value.metadata } : null,
  });
}

function normalizeCompletenessStatus(
  completenessStatus: CollectionFactCompletenessStatus | undefined
): CollectionFactCompletenessStatus {
  return completenessStatus ?? "unknown";
}

function toSignalSortKey(value: CollectionSignalValue): string {
  return `${value.signalKey}|${value.calculationVersion}|${value.computedAt}|${value.signalRunKey}`;
}

export function createInMemoryCollectionSignalRepository(): CollectionSignalRepository {
  const valuesById = new Map<string, CollectionSignalValue>();
  const idBySignalRunKey = new Map<string, string>();

  return {
    async upsertCollectionSignalValues(
      values: readonly UpsertCollectionSignalValueInput[]
    ): Promise<readonly CollectionSignalValue[]> {
      if (values.length === 0) return Object.freeze([]);

      const timestamp = new Date().toISOString();
      const rows: CollectionSignalValue[] = [];
      for (const input of values) {
        const signalRunKey = toCollectionSignalRunKey({
          collectionIdentityId: input.collectionIdentityId,
          signalKey: input.signalKey,
          calculationVersion: input.calculationVersion,
          computedAt: input.computedAt,
          sourceWindowStart: input.sourceWindowStart ?? null,
          sourceWindowEnd: input.sourceWindowEnd ?? null,
        });
        const existingId = idBySignalRunKey.get(signalRunKey);
        const existing = existingId ? valuesById.get(existingId) : undefined;
        const row: CollectionSignalValue = {
          id: existing?.id ?? randomUUID(),
          collectionIdentityId: input.collectionIdentityId,
          signalKey: input.signalKey,
          calculationVersion: input.calculationVersion,
          signalRunKey,
          numericValue: input.numericValue ?? null,
          structuredValue: input.structuredValue ?? null,
          computedAt: input.computedAt,
          sourceWindowStart: input.sourceWindowStart ?? null,
          sourceWindowEnd: input.sourceWindowEnd ?? null,
          completenessStatus: normalizeCompletenessStatus(input.completenessStatus),
          metadata: input.metadata ?? null,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        valuesById.set(row.id, row);
        idBySignalRunKey.set(signalRunKey, row.id);
        rows.push(freezeSignalValue(row));
      }

      return Object.freeze(rows);
    },

    async listCollectionSignalValues(
      collectionIdentityId: string,
      signalKeys?: readonly CollectionDerivedSignalKey[]
    ): Promise<readonly CollectionSignalValue[]> {
      const signalKeySet = signalKeys ? new Set(signalKeys) : null;
      return Object.freeze(
        Array.from(valuesById.values())
          .filter((value) => value.collectionIdentityId === collectionIdentityId)
          .filter((value) => (signalKeySet ? signalKeySet.has(value.signalKey) : true))
          .sort((left, right) => {
            const leftKey = toSignalSortKey(left);
            const rightKey = toSignalSortKey(right);
            return leftKey.localeCompare(rightKey);
          })
          .map(freezeSignalValue)
      );
    },

    async listLatestCollectionSignalValues(
      collectionIdentityId: string
    ): Promise<readonly CollectionSignalValue[]> {
      const allRows = await this.listCollectionSignalValues(collectionIdentityId);
      const latestBySignal = new Map<CollectionDerivedSignalKey, CollectionSignalValue>();
      for (const row of allRows) {
        const existing = latestBySignal.get(row.signalKey);
        if (!existing) {
          latestBySignal.set(row.signalKey, row);
          continue;
        }
        const existingMs = Date.parse(existing.computedAt);
        const rowMs = Date.parse(row.computedAt);
        if (rowMs > existingMs) {
          latestBySignal.set(row.signalKey, row);
          continue;
        }
        if (rowMs === existingMs && row.updatedAt > existing.updatedAt) {
          latestBySignal.set(row.signalKey, row);
        }
      }
      return Object.freeze(
        Array.from(latestBySignal.values())
          .sort((left, right) => left.signalKey.localeCompare(right.signalKey))
          .map(freezeSignalValue)
      );
    },
  };
}
