import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "fs";
import { createElement } from "react";

// Inline minimal mirrors of the presentational UI for screenshot fixtures.
// Keeps this script free of path-alias / CSS module coupling.

function VerifyWalletFlowView({ phase, address }) {
  return createElement(
    "div",
    {
      className:
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center",
      "data-testid": "verify-wallet-flow",
      "data-phase": phase,
    },
    createElement(
      "span",
      {
        className:
          "flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10",
      },
      "◎"
    ),
    createElement(
      "p",
      { className: "mt-4 text-sm font-medium", "data-testid": "verify-wallet-phase-label" },
      "Verify Wallet"
    ),
    createElement(
      "p",
      {
        className: "mt-1 max-w-md text-sm text-slate-400",
        "data-testid": "verify-wallet-ready-copy",
      },
      "Prove ownership of your connected wallet, then synchronize your collectibles."
    ),
    createElement(
      "p",
      { className: "mt-3 text-xs text-slate-400", "data-testid": "verify-wallet-preselected" },
      `EVM · ${address.slice(0, 6)}…${address.slice(-4)}`
    ),
    createElement(
      "button",
      {
        type: "button",
        className:
          "mt-5 min-w-[10rem] rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white",
        "data-testid": "verify-wallet-action",
      },
      "Verify Wallet"
    ),
    createElement(
      "p",
      {
        className: "mt-3 max-w-sm text-[11px] text-slate-500",
        "data-testid": "verify-wallet-gasless-note",
      },
      "Message signing only — no blockchain transaction, no gas, no token approvals."
    )
  );
}

function shell(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body{background:#0b1020;color:#e8eefc;font-family:ui-sans-serif,system-ui;padding:32px}</style>
  </head><body><div style="max-width:720px;margin:0 auto">${body}</div></body></html>`;
}

const address = "0xAbCdEf1234567890abcdef1234567890abcdef12";
const flow = renderToStaticMarkup(
  createElement(VerifyWalletFlowView, { phase: "ready", address })
);

const empty = shell(
  "No verified wallet state",
  `<div data-testid="no-verified-wallets-empty-state">
    <h1 class="text-2xl font-semibold">collector</h1>
    <p class="text-sm text-slate-400 mb-6">@collector</p>
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-5 mb-4 text-xs text-slate-400">
      <div class="rounded-lg border border-white/10 px-3 py-2">Verified Wallets<br/><span class="text-white text-sm">0</span></div>
      <div class="rounded-lg border border-white/10 px-3 py-2">Collections<br/><span class="text-white text-sm">—</span></div>
      <div class="rounded-lg border border-white/10 px-3 py-2">Unique Tokens<br/><span class="text-white text-sm">—</span></div>
      <div class="rounded-lg border border-white/10 px-3 py-2">Inventory Status<br/><span class="text-white text-sm">—</span></div>
      <div class="rounded-lg border border-white/10 px-3 py-2">Latest Sync<br/><span class="text-white text-sm">—</span></div>
    </div>
    ${flow}
  </div>`
);

const ready = shell("Verification ready state", flow);

mkdirSync("/opt/cursor/artifacts/screenshots", { recursive: true });
writeFileSync("/opt/cursor/artifacts/screenshots/no-verified-wallet-state.html", empty);
writeFileSync("/opt/cursor/artifacts/screenshots/verification-ready-state.html", ready);
console.log("wrote fixtures");
