# AGENTS.md

# Collect Digital

Repository-wide instructions for AI coding agents.

This file contains repository-wide engineering rules only.
Product-specific behavior belongs in `.cursor/rules/`.

---

# Product DNA

Collect Digital is a premium Web3 discovery platform for collectors, creators, and communities.

When multiple implementation options exist:

- Prioritize trust over engagement.
- Prioritize knowledge over content.
- Prioritize discovery over navigation.
- Prioritize explainability over black-box behavior.
- Prioritize long-term architecture over short-term hacks.
- Never fabricate blockchain, wallet, marketplace, social, or scoring data.

---

# Tech Stack

Framework:
- Next.js
- React
- TypeScript

Styling:
- Tailwind CSS

Backend:
- Supabase

Authentication:
- Privy

Deployment:
- Vercel

Blockchain:
- EVM-compatible chains

Package Manager:
- npm

---

# Development Commands

Install

```bash
npm install
```

Development

```bash
npm run dev
```

Build

```bash
npm run build
```

Lint

```bash
npm run lint
```

Type Check

```bash
npm run type-check
```

Tests

```bash
npm test
```

Always run:

- Build
- Lint
- Type Check

before considering work complete.

---

# Architecture Rules

Prefer extending existing components over creating new ones.

Reuse existing UI patterns.

Keep business logic out of presentation components.

Prefer composition over duplication.

Never introduce new dependencies without clear justification.

Avoid unnecessary abstractions.

Optimize for maintainability rather than cleverness.

---

# Code Standards

Use strict TypeScript.

Avoid `any`.

Prefer server-side operations when appropriate.

Keep components focused on a single responsibility.

Keep files reasonably small and cohesive.

Use descriptive naming.

Delete dead code.

Do not leave TODO comments unless specifically requested.

---

# Git & Pull Requests

Prefer small, reviewable pull requests.

Do not mix unrelated concerns.

Avoid large refactors while implementing features.

Do not rename files unless necessary.

Preserve backward compatibility whenever possible.

---

# Security

Never commit:

- API keys
- Secrets
- Tokens
- Passwords
- Private keys
- `.env` contents

Never expose server secrets to the client.

---

# NEVER

Never fabricate data.

Never invent APIs.

Never invent database schema.

Never invent environment variables.

Never remove security checks.

Never silently change business logic.

Never rewrite large sections of the application unless requested.

Never break existing functionality to implement a new feature.

Never optimize code at the expense of readability.

---

# When Unsure

Choose the simplest solution that:

- fits existing architecture
- minimizes code changes
- keeps pull requests small
- preserves future extensibility

If a decision requires product direction rather than engineering judgment, stop and ask instead of making assumptions.