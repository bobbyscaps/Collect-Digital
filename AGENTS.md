# AGENTS.md

## Cursor Cloud specific instructions

### Current repository state

This repository is at the very earliest stage of development. As of this writing it
contains **only `README.md`** (a product-vision document for "Collect Digital", an NFT
project intelligence platform). There is:

- **No application code** of any kind.
- **No dependency manifests** (`package.json`, `requirements.txt`, `pyproject.toml`,
  `go.mod`, `Cargo.toml`, etc.).
- **No build, lint, test, or run commands**, and no services to start.

As a result there is currently **nothing to install, build, lint, test, or run**. The
startup update script is intentionally a no-op until a real stack is introduced.

### When code is added

Once an application/stack is introduced, update this file and the startup update script:

- Add the dependency-install command(s) for the chosen package manager to the update
  script via the environment setup tooling (e.g. `npm install` / `pnpm install` /
  `pip install -r requirements.txt` / `uv sync`). Match the package manager to whatever
  lockfile gets committed.
- Document here the non-obvious commands and caveats for linting, testing, building, and
  running each service.

### Available toolchains in this environment

The base VM already provides (no install needed): Node `v22`, npm, pnpm, yarn,
Python `3.12`, pip, Go `1.22`, Rust `1.83`, and git. Docker is **not** installed.
