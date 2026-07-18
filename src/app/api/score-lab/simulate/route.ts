import { NextResponse } from "next/server";
import { z } from "zod";

import { DEFAULT_SCORING_VERSION } from "@/lib/mock-data";
import { getCollectionEvaluation } from "@/lib/opensea/service";
import { computeScoreSimulation } from "@/lib/scoring/engine";
import { listScoringVersions } from "@/lib/scoring/repository";
import type { ScoringModelVersion } from "@/lib/types";

const schema = z.object({
  baseVersionId: z.string(),
  collectionSlug: z.string(),
  candidateVersion: z.custom<ScoringModelVersion>(),
});

export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  const evaluation = await getCollectionEvaluation(body.collectionSlug);
  const versions = await listScoringVersions();
  const baseline =
    versions.find((version) => version.id === body.baseVersionId) ??
    DEFAULT_SCORING_VERSION;

  const simulation = computeScoreSimulation(
    evaluation,
    baseline,
    body.candidateVersion
  );

  return NextResponse.json(simulation);
}
