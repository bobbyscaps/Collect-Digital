import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import {
  hasNoVerifiedWallets,
  hasVerifiedCollectorIdentity,
  isWalletRegistryUnavailable,
} from "@/components/collector-identity/no-verified-wallets";
import type { CollectorIdentityResponse } from "@/lib/collector-identity/api-models";
import { handleGetCollectorIdentityMe } from "@/lib/collector-identity/http";
import {
  USER_FACING_IDENTITY_UNAVAILABLE,
  USER_FACING_SERVICE_UNAVAILABLE,
  isInfrastructureErrorMessage,
  toUserFacingErrorMessage,
} from "@/lib/errors/user-facing";
import { createAuthenticatedProfileContext } from "@/lib/wallet-verification/auth-context";
import { readFileSync } from "node:fs";
import path from "node:path";

test("infrastructure error messages are detected", () => {
  assert.equal(
    isInfrastructureErrorMessage(
      "Supabase admin client unavailable for ProfileWalletRepository."
    ),
    true
  );
  assert.equal(
    isInfrastructureErrorMessage("Invalid wallet ownership signature."),
    false
  );
});

test("toUserFacingErrorMessage never returns repository names", () => {
  const message = toUserFacingErrorMessage(
    new Error(
      "Supabase admin client unavailable for ProfileWalletRepository."
    )
  );
  assert.equal(message, USER_FACING_SERVICE_UNAVAILABLE);
  assert.equal(message.includes("ProfileWalletRepository"), false);
  assert.equal(message.includes("Supabase"), false);
});

test("GET /api/collector-identity/me sanitizes infrastructure failures", async () => {
  const response = await handleGetCollectorIdentityMe(
    new Request("http://localhost/api/collector-identity/me", {
      headers: { Authorization: "Bearer token" },
    }),
    {
      requireAuth: async () => ({
        ok: true,
        privyUserId: "did:privy:user",
        auth: createAuthenticatedProfileContext("did:privy:user"),
      }),
      identityService: {
        async getMyIdentity() {
          throw new Error(
            "Supabase admin client unavailable for ProfileWalletRepository."
          );
        },
      },
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "service_unavailable");
  assert.equal(body.error.message, USER_FACING_IDENTITY_UNAVAILABLE);
  assert.equal(body.error.message.includes("ProfileWalletRepository"), false);
  assert.equal(body.error.message.includes("Supabase"), false);
});

test("ProgressiveData empty state shows message only once", () => {
  const message = "Verify a wallet to sync your collectibles.";
  const html = renderToStaticMarkup(
    React.createElement(ProgressiveData, {
      state: "empty",
      data: null,
      message,
    })
  );

  assert.match(html, /data-progressive-state="empty"/);
  assert.match(html, /data-testid="progressive-empty"/);
  assert.equal(html.split(message).length - 1, 1);
});

test("ProgressiveData error state shows message only once", () => {
  const message = USER_FACING_SERVICE_UNAVAILABLE;
  const html = renderToStaticMarkup(
    React.createElement(ProgressiveData, {
      state: "error",
      data: null,
      message,
    })
  );

  assert.match(html, /data-progressive-state="error"/);
  assert.equal(html.split(message).length - 1, 1);
  assert.equal(html.includes("ProfileWalletRepository"), false);
});

test("Collector Score helpers gate on verified identity", () => {
  const empty = {
    wallets: { state: "empty", data: null, lastUpdatedAt: null, message: "x" },
  } as CollectorIdentityResponse;
  const error = {
    wallets: {
      state: "error",
      data: null,
      lastUpdatedAt: null,
      message: USER_FACING_SERVICE_UNAVAILABLE,
    },
  } as CollectorIdentityResponse;
  const live = {
    wallets: {
      state: "live",
      data: { verifiedWalletCount: 1 },
      lastUpdatedAt: null,
      message: null,
    },
  } as CollectorIdentityResponse;

  assert.equal(hasNoVerifiedWallets(empty), true);
  assert.equal(hasVerifiedCollectorIdentity(empty), false);
  assert.equal(isWalletRegistryUnavailable(error), true);
  assert.equal(hasVerifiedCollectorIdentity(error), false);
  assert.equal(hasVerifiedCollectorIdentity(live), true);
});

test("bio page hides Collector Score until verified wallets exist", () => {
  const bio = readFileSync(
    path.join(process.cwd(), "src/app/profile/[username]/page.tsx"),
    "utf8"
  );
  assert.match(bio, /hasVerifiedCollectorIdentity/);
  assert.match(bio, /showCollectorScore/);
  assert.equal(bio.includes("Inventory requires at least one verified wallet"), false);
});

test("ratings page hides scores before verification", () => {
  const ratings = readFileSync(
    path.join(process.cwd(), "src/app/profile/[username]/ratings/page.tsx"),
    "utf8"
  );
  assert.match(ratings, /hasVerifiedCollectorIdentity/);
  assert.match(ratings, /Verify a connected wallet/);
});

test(".env.example documents required Supabase Vercel variables", () => {
  const envExample = readFileSync(
    path.join(process.cwd(), ".env.example"),
    "utf8"
  );
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=/);
  assert.match(envExample, /NEVER expose to the client/);
  assert.match(envExample, /Vercel/);
});
