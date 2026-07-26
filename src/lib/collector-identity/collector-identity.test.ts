import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { createAuthenticatedProfileContext } from "@/lib/wallet-verification/auth-context";
import { createCollectorAnalysisService } from "@/lib/collector-analysis/service";
import {
  createCollectorIdentityService,
  type CollectorIdentityService,
} from "@/lib/collector-identity/compose";
import {
  COLLECTOR_IDENTITY_API_SCHEMA_VERSION,
  type CollectorIdentityResponse,
  type ProgressiveDataState,
} from "@/lib/collector-identity/api-models";
import {
  CollectorIdentityClientError,
  fetchMyCollectorIdentity,
} from "@/lib/collector-identity/client";
import { handleGetCollectorIdentityMe } from "@/lib/collector-identity/http";
import { createInMemoryProfileWalletRepository } from "@/lib/profile-wallets/repository";
import { stableCollectionId } from "@/lib/wallet-inventory/domain";
import {
  createInMemoryWalletInventoryRepository,
  type UpsertHoldingInput,
  type WalletInventoryRepository,
} from "@/lib/wallet-inventory/repository";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import {
  hasNoVerifiedWallets,
  NO_VERIFIED_WALLETS_DESCRIPTION,
  NO_VERIFIED_WALLETS_TITLE,
} from "@/components/collector-identity/no-verified-wallets";

async function createVerifiedWallet(
  profileWallets = createInMemoryProfileWalletRepository(),
  input: {
    profileId?: string;
    chainNamespace?: "eip155" | "solana";
    address?: string;
  } = {}
) {
  const created = await profileWallets.createWallet({
    profileId: input.profileId ?? "did:privy:collector-1",
    chainNamespace: input.chainNamespace ?? "eip155",
    address: input.address ?? "0xAbCdEf1234567890abcdef1234567890abcdef12",
    role: "connected",
  });
  const verified = await profileWallets.markWalletVerified(created.id);
  return { profileWallets, wallet: verified };
}

function holdingInput(
  walletId: string,
  overrides: Partial<UpsertHoldingInput> &
    Pick<UpsertHoldingInput, "contractAddress" | "tokenId">
): UpsertHoldingInput {
  const chainNamespace = overrides.chainNamespace ?? "eip155";
  const contractAddress = overrides.contractAddress;
  return {
    walletId,
    chainNamespace,
    contractAddress,
    tokenId: overrides.tokenId,
    assetStandard: overrides.assetStandard ?? "erc721",
    quantity: overrides.quantity ?? "1",
    collectionId:
      overrides.collectionId === undefined
        ? stableCollectionId(chainNamespace, contractAddress)
        : overrides.collectionId,
    ownerAddress: overrides.ownerAddress ?? "0xowner",
    acquiredAt: overrides.acquiredAt ?? null,
    lastSeenAt: overrides.lastSeenAt ?? "2026-07-25T12:00:00.000Z",
    sourceProvider: overrides.sourceProvider ?? "test-inventory",
  };
}

function createIdentityStack(input?: {
  profileWallets?: ReturnType<typeof createInMemoryProfileWalletRepository>;
  inventory?: WalletInventoryRepository;
  analysis?: ReturnType<typeof createCollectorAnalysisService>;
}) {
  const profileWallets =
    input?.profileWallets ?? createInMemoryProfileWalletRepository();
  const inventory =
    input?.inventory ?? createInMemoryWalletInventoryRepository();
  const analysis =
    input?.analysis ??
    createCollectorAnalysisService({ profileWallets, inventory });
  const service = createCollectorIdentityService({
    profileWallets,
    inventory,
    analysis,
  });
  return { profileWallets, inventory, analysis, service };
}

function auth(profileId: string) {
  return createAuthenticatedProfileContext(profileId);
}

function assertNoFabricatedMetrics(identity: CollectorIdentityResponse) {
  const serialized = JSON.stringify(identity).toLowerCase();
  const forbidden = [
    "elite flipper",
    "sample data",
    "alchemy",
    "helius",
    "rawresponse",
    "providerpayload",
    "floorprice",
    "rarityrank",
  ];
  for (const key of forbidden) {
    assert.equal(
      serialized.includes(key),
      false,
      `identity must not include fabricated/forbidden signal: ${key}`
    );
  }

  // Score/social modules may be named, but must never carry numeric fake data.
  assert.equal(identity.statusModules.collectorScore.state, "coming_soon");
  assert.equal(identity.statusModules.collectorScore.data, null);
  assert.equal(identity.statusModules.collectionScores.state, "coming_soon");
  assert.equal(identity.statusModules.collectionScores.data, null);
  assert.equal(identity.statusModules.communities.state, "coming_soon");
  assert.equal(identity.statusModules.followers.state, "coming_soon");
  assert.equal(identity.statusModules.following.state, "coming_soon");
  assert.equal(identity.achievements.state, "coming_soon");
  assert.equal(identity.achievements.data, null);
  assert.equal(identity.schemaVersion, COLLECTOR_IDENTITY_API_SCHEMA_VERSION);
}

test("API authenticated request returns sectioned Collector Identity", async () => {
  const { profileWallets, inventory, service } = createIdentityStack();
  const { wallet } = await createVerifiedWallet(profileWallets, {
    profileId: "did:privy:collector-1",
  });
  await inventory.replaceWalletInventory({
    walletId: wallet.id,
    holdings: [
      holdingInput(wallet.id, {
        contractAddress: "0x1111111111111111111111111111111111111111",
        tokenId: "1",
      }),
    ],
  });
  const sync = await inventory.startSync({
    walletId: wallet.id,
    provider: "test",
    syncStartedAt: "2026-07-25T10:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: sync.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T10:00:05.000Z",
  });

  const response = await handleGetCollectorIdentityMe(
    new Request("http://localhost/api/collector-identity/me", {
      headers: { Authorization: "Bearer test-token" },
    }),
    {
      identityService: service,
      requireAuth: async () => ({
        ok: true as const,
        privyUserId: "did:privy:collector-1",
        auth: auth("did:privy:collector-1"),
      }),
    }
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as CollectorIdentityResponse;
  assert.equal(body.profileId, "did:privy:collector-1");
  assert.equal(body.wallets.state, "live");
  assert.equal(body.wallets.data?.verifiedWalletCount, 1);
  assert.equal(body.inventory.state, "live");
  assert.equal(body.inventory.data?.uniqueTokenCount, 1);
  assertNoFabricatedMetrics(body);
});

test("API unauthenticated request is rejected", async () => {
  const { service } = createIdentityStack();
  const response = await handleGetCollectorIdentityMe(
    new Request("http://localhost/api/collector-identity/me"),
    {
      identityService: service,
      requireAuth: async () => ({
        ok: false as const,
        status: 401,
        message: "Authentication required.",
        code: "authentication_required" as const,
      }),
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "authentication_required");
});

test("profile not found yields empty wallets without failing identity", async () => {
  const { service } = createIdentityStack();
  const identity = await service.getMyIdentity(auth("did:privy:missing"));

  assert.equal(identity.profileId, "did:privy:missing");
  assert.equal(identity.identity.state, "live");
  assert.equal(identity.wallets.state, "empty");
  assert.equal(identity.inventory.state, "empty");
  assert.equal(identity.achievements.state, "coming_soon");
  assertNoFabricatedMetrics(identity);
});

test("no verified wallets keeps identity renderable", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  await profileWallets.createWallet({
    profileId: "did:privy:pending",
    chainNamespace: "eip155",
    address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
    role: "connected",
  });
  const { service } = createIdentityStack({ profileWallets });
  const identity = await service.getMyIdentity(auth("did:privy:pending"));

  assert.equal(identity.wallets.state, "empty");
  assert.match(identity.wallets.message ?? "", /verified/i);
  assert.equal(identity.inventory.state, "empty");
  assert.equal(identity.identity.state, "live");
  assertNoFabricatedMetrics(identity);
});

test("partial inventory is exposed as partial progressive state", async () => {
  const { profileWallets, inventory, service } = createIdentityStack();
  const profileId = "did:privy:partial";
  const first = await createVerifiedWallet(profileWallets, {
    profileId,
    address: "0x1111111111111111111111111111111111111111",
  });
  const second = await createVerifiedWallet(first.profileWallets, {
    profileId,
    address: "0x2222222222222222222222222222222222222222",
  });

  await inventory.replaceWalletInventory({
    walletId: first.wallet.id,
    holdings: [
      holdingInput(first.wallet.id, {
        contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        tokenId: "7",
      }),
    ],
  });
  const sync = await inventory.startSync({
    walletId: first.wallet.id,
    provider: "test",
    syncStartedAt: "2026-07-25T09:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: sync.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T09:00:05.000Z",
  });
  // second wallet never synced

  const identity = await service.getMyIdentity(auth(profileId));
  assert.equal(identity.wallets.state, "live");
  assert.equal(identity.wallets.data?.verifiedWalletCount, 2);
  assert.equal(identity.inventory.state, "partial");
  assert.equal(identity.inventory.data?.uniqueTokenCount, 1);
  assert.equal(identity.collectionSummaries.state, "partial");
  assert.ok(second.wallet.id);
  assertNoFabricatedMetrics(identity);
});

test("stale inventory uses last persisted holdings when analysis fails", async () => {
  const { profileWallets, inventory } = createIdentityStack();
  const profileId = "did:privy:stale";
  const { wallet } = await createVerifiedWallet(profileWallets, { profileId });
  await inventory.replaceWalletInventory({
    walletId: wallet.id,
    holdings: [
      holdingInput(wallet.id, {
        contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        tokenId: "3",
        quantity: "2",
      }),
    ],
  });
  const sync = await inventory.startSync({
    walletId: wallet.id,
    provider: "test",
    syncStartedAt: "2026-07-25T08:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: sync.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T08:00:10.000Z",
  });

  const failingAnalysis = {
    async analyzeCollectorInventory() {
      throw new Error("analysis exploded");
    },
  };

  const service = createCollectorIdentityService({
    profileWallets,
    inventory,
    analysis: failingAnalysis,
  });

  const identity = await service.getMyIdentity(auth(profileId));
  assert.equal(identity.wallets.state, "live");
  assert.equal(identity.inventory.state, "stale");
  assert.equal(identity.inventory.data?.uniqueTokenCount, 1);
  assert.equal(identity.inventory.lastUpdatedAt, "2026-07-25T08:00:10.000Z");
  assert.match(identity.inventory.message ?? "", /last successfully persisted/i);
  assertNoFabricatedMetrics(identity);
});

test("inventory unavailable without persisted fallback is an error section", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const profileId = "did:privy:unavailable";
  await createVerifiedWallet(profileWallets, { profileId });

  const brokenInventory: WalletInventoryRepository = {
    ...createInMemoryWalletInventoryRepository(),
    async listHoldingsByWallets() {
      throw new Error("holdings down");
    },
    async findLatestSuccessfulSyncs() {
      throw new Error("syncs down");
    },
  };

  const failingAnalysis = {
    async analyzeCollectorInventory() {
      throw new Error("analysis down");
    },
  };

  const service = createCollectorIdentityService({
    profileWallets,
    inventory: brokenInventory,
    analysis: failingAnalysis,
  });

  const identity = await service.getMyIdentity(auth(profileId));
  assert.equal(identity.identity.state, "live");
  assert.equal(identity.wallets.state, "live");
  assert.equal(identity.inventory.state, "error");
  assert.equal(identity.collectionSummaries.state, "error");
  assertNoFabricatedMetrics(identity);
});

test("one failed section does not prevent remaining identity from rendering", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const profileId = "did:privy:resilient";
  const { wallet } = await createVerifiedWallet(profileWallets, { profileId });

  const inventory = createInMemoryWalletInventoryRepository();
  const failingAnalysis = {
    async analyzeCollectorInventory() {
      throw new Error("inventory analysis failed");
    },
  };
  const service = createCollectorIdentityService({
    profileWallets,
    inventory,
    analysis: failingAnalysis,
  });

  const identity = await service.getMyIdentity(auth(profileId));
  assert.equal(identity.identity.state, "live");
  assert.equal(identity.wallets.state, "live");
  assert.equal(identity.wallets.data?.verifiedWallets[0]?.walletId, wallet.id);
  assert.ok(
    identity.inventory.state === "error" || identity.inventory.state === "stale"
  );
  assert.equal(identity.achievements.state, "coming_soon");
});

test("typed client parses success and typed errors", async () => {
  const ok = await fetchMyCollectorIdentity({
    accessToken: "token",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          profileId: "did:privy:x",
          identity: {
            state: "live",
            data: {
              profileId: "did:privy:x",
              displayName: null,
              avatarUrl: null,
              bio: null,
            },
            lastUpdatedAt: null,
            message: null,
          },
          wallets: {
            state: "empty",
            data: null,
            lastUpdatedAt: null,
            message: "No verified wallets yet.",
          },
          inventory: {
            state: "empty",
            data: null,
            lastUpdatedAt: null,
            message: "Verify a wallet to sync your collectibles.",
          },
          collectionSummaries: {
            state: "empty",
            data: null,
            lastUpdatedAt: null,
            message: "Verify a wallet to see collection summaries.",
          },
          statusModules: {
            collectorScore: {
              state: "coming_soon",
              data: null,
              lastUpdatedAt: null,
              message: "Collector Score coming soon",
            },
            collectionScores: {
              state: "coming_soon",
              data: null,
              lastUpdatedAt: null,
              message: "Collection Scores coming soon",
            },
            communities: {
              state: "coming_soon",
              data: null,
              lastUpdatedAt: null,
              message: "Communities coming soon",
            },
            followers: {
              state: "coming_soon",
              data: null,
              lastUpdatedAt: null,
              message: "Followers coming soon",
            },
            following: {
              state: "coming_soon",
              data: null,
              lastUpdatedAt: null,
              message: "Following coming soon",
            },
          },
          achievements: {
            state: "coming_soon",
            data: null,
            lastUpdatedAt: null,
            message: "Achievements coming soon",
          },
        }),
        { status: 200 }
      ),
  });
  assert.equal(ok.profileId, "did:privy:x");

  await assert.rejects(
    () =>
      fetchMyCollectorIdentity({
        accessToken: "token",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "authentication_required",
                message: "Authentication required.",
              },
            }),
            { status: 401 }
          ),
      }),
    (error: unknown) => {
      assert.ok(error instanceof CollectorIdentityClientError);
      assert.equal(error.status, 401);
      assert.equal(error.code, "authentication_required");
      return true;
    }
  );
});

const UI_STATES: ProgressiveDataState[] = [
  "loading",
  "live",
  "stale",
  "empty",
  "partial",
  "error",
  "coming_soon",
];

test("no-verified-wallets empty state exposes title/description and hosts Verify Wallet flow", () => {
  // Empty-state shell is static; the hooked VerifyWalletFlow requires Privy and
  // is covered by wallet-verification-flow UI/API tests.
  const source = readFileSync(
    path.join(
      process.cwd(),
      "src/components/collector-identity/no-verified-wallets-empty-state.tsx"
    ),
    "utf8"
  );

  assert.match(source, /data-testid="no-verified-wallets-empty-state"/);
  assert.match(source, /NO_VERIFIED_WALLETS_TITLE/);
  assert.match(source, /NO_VERIFIED_WALLETS_DESCRIPTION/);
  assert.match(source, /VerifyWalletFlow/);
  assert.match(source, /onIdentityRefresh/);
  assert.equal(source.includes("Coming next"), false);
  assert.equal(source.includes("Inventory requires at least one verified wallet"), false);
  assert.ok(NO_VERIFIED_WALLETS_TITLE.length > 0);
  assert.ok(NO_VERIFIED_WALLETS_DESCRIPTION.length > 0);
});

test("no-verified-wallets empty state does not import domain mutation services", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "src/components/collector-identity/no-verified-wallets-empty-state.tsx"
    ),
    "utf8"
  );

  assert.equal(source.includes("markWalletVerified"), false);
  assert.equal(source.includes("createWalletVerificationService"), false);
  assert.equal(source.includes("createWalletInventoryService"), false);
  assert.equal(source.includes("supabase"), false);
});

test("hasNoVerifiedWallets detects empty wallets section only", () => {
  const emptyIdentity = {
    wallets: { state: "empty", data: null, lastUpdatedAt: null, message: "x" },
  } as CollectorIdentityResponse;
  const liveIdentity = {
    wallets: {
      state: "live",
      data: { verifiedWalletCount: 1 },
      lastUpdatedAt: null,
      message: null,
    },
  } as CollectorIdentityResponse;

  assert.equal(hasNoVerifiedWallets(emptyIdentity), true);
  assert.equal(hasNoVerifiedWallets(liveIdentity), false);
  assert.equal(hasNoVerifiedWallets(null), false);
});

test("profile header uses a single no-verified-wallets empty state", () => {
  const header = readFileSync(
    path.join(process.cwd(), "src/components/profile/profile-header.tsx"),
    "utf8"
  );
  const bio = readFileSync(
    path.join(process.cwd(), "src/app/profile/[username]/page.tsx"),
    "utf8"
  );

  assert.match(header, /NoVerifiedWalletsEmptyState/);
  assert.match(header, /hasNoVerifiedWallets/);
  assert.equal(header.includes("Inventory requires at least one verified wallet"), false);
  // Bio must not re-render a second copy of the guided empty state.
  assert.equal(bio.includes("NoVerifiedWalletsEmptyState"), false);
  assert.equal(bio.includes("Inventory requires at least one verified wallet"), false);
  assert.match(header, /Verified Wallets/);
  assert.match(header, /Collections/);
  assert.match(header, /Unique Tokens/);
  assert.match(header, /Inventory Status/);
  assert.match(header, /Latest Sync/);
});

for (const state of UI_STATES) {
  test(`UI ProgressiveData renders ${state} state`, () => {
    const data =
      state === "live" || state === "stale" || state === "partial"
        ? { value: 3 }
        : null;
    const html = renderToStaticMarkup(
      React.createElement(ProgressiveData<{ value: number }>, {
        state,
        data,
        lastUpdatedAt:
          state === "stale" || state === "partial"
            ? "2026-07-25T08:00:10.000Z"
            : null,
        message:
          state === "coming_soon"
            ? "Coming Soon"
            : state === "error"
              ? "Unavailable"
              : state === "empty"
                ? "No data yet."
                : state === "stale"
                  ? "Showing last successfully persisted inventory."
                  : null,
        render: (value) =>
          React.createElement("span", null, `value:${value.value}`),
      })
    );

    assert.match(html, new RegExp(`data-progressive-root="${state}"`));
    if (state === "loading") assert.match(html, /Loading/);
    if (state === "coming_soon") assert.match(html, /Coming Soon/);
    if (state === "empty") assert.match(html, /No data yet/);
    if (state === "error") assert.match(html, /Unavailable/);
    if (state === "stale") {
      assert.match(html, /Stale/);
      assert.match(html, /Last updated/);
      assert.match(html, /value:3/);
    }
    if (state === "partial") {
      assert.match(html, /Partial/);
      assert.match(html, /value:3/);
    }
    if (state === "live") assert.match(html, /value:3/);
  });
}

test("regression: profile pages no longer embed Elite Flipper or fake scores", () => {
  const roots = [
    "src/components/profile/profile-header.tsx",
    "src/app/profile/[username]/page.tsx",
    "src/app/profile/[username]/ratings/page.tsx",
    "src/app/profile/[username]/communities/page.tsx",
    "src/app/profile/[username]/activity/page.tsx",
    "src/app/profile/[username]/collection/page.tsx",
    "src/app/profile/[username]/showcase/page.tsx",
    "src/app/profile/[username]/layout.tsx",
  ];

  const forbidden = [
    "Elite Flipper",
    "flipperScore",
    "collectPoints",
    "getProfileWithRating",
    "sample data",
    "March 2021",
    "Bored Ape Yacht Club",
    "projectScore",
    "ratingSource",
    "getSyntheticWalletMetrics",
  ];

  for (const relative of roots) {
    const source = readFileSync(path.join(process.cwd(), relative), "utf8");
    for (const needle of forbidden) {
      assert.equal(
        source.includes(needle),
        false,
        `${relative} must not contain fabricated metric signal: ${needle}`
      );
    }
  }

  const comingSoonRoots = roots.filter(
    (relative) => !relative.endsWith("layout.tsx")
  );
  for (const relative of comingSoonRoots) {
    const source = readFileSync(path.join(process.cwd(), relative), "utf8");
    assert.match(
      source.toLowerCase(),
      /coming soon/,
      `${relative} should retain Coming Soon affordances where unsupported`
    );
  }
});

test("regression: layout no longer server-loads mock profile ratings", () => {
  const layout = readFileSync(
    path.join(process.cwd(), "src/app/profile/[username]/layout.tsx"),
    "utf8"
  );
  assert.equal(layout.includes("getProfileWithRating"), false);
  assert.equal(layout.includes("getProfile("), false);
  assert.match(layout, /ProfileProvider username=\{username\}/);
});

test("docs describe progressive states and stale policy", () => {
  const docs = readFileSync(
    path.join(process.cwd(), "docs/collector-identity.md"),
    "utf8"
  );
  for (const needle of [
    "Progressive data-state",
    "Coming Soon",
    "stale",
    "Achievements \\(Permanent\\)",
    "Status \\(Dynamic\\)",
    "GET /api/collector-identity/me",
    "Never display fabricated data",
  ]) {
    assert.match(docs, new RegExp(needle, "i"));
  }
});

test("achievement metadata contract is reserved without persistence", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/lib/collector-identity/achievements.ts"),
    "utf8"
  );
  for (const field of [
    "achievementId",
    "badgeId",
    "badgeName",
    "icon",
    "description",
    "earnedAt",
    "awardedBy",
    "rulesVersion",
    "rarity",
    "displayOrder",
    "permanent",
  ]) {
    assert.match(source, new RegExp(field));
  }
  assert.equal(source.includes("createTable"), false);
  assert.equal(source.includes("supabase"), false);
});

// Keep unused import lint-free for service type in future expansions.
void (null as unknown as CollectorIdentityService);
