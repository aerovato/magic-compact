---
description: Main codebase map for Magic Compact — plugin packages, docs, scripts, and config.
read_if: Working in any part of the repository; read before exploring or modifying code.
---

# Shared Project Index

## Architecture

- Magic Compact is a lossless context compression plugin for OpenCode and Claude Code, performing per-turn conversation compaction while preserving the conversation skeleton.
- Runtime surfaces: `/magic-compact [N]`, `/magic-trim [N]` (OpenCode exclusive), `/magic-stats` (OpenCode exclusive), and the `read_omitted_content` tool.

## Project Index

- `package.json` — Ditto
- `README.md` — User-facing overview (English)
- `README.zh-CN.md` — User-facing overview (Chinese translation)
- `AGENTS.md` — Root agent instructions; points to Operator Memory
- `LICENSE.md` — Ditto
- `opencode.json` — OpenCode project configuration
- `eslint.config.js` — ESLint flat config: TypeScript recommended + Prettier compat + Bun globals
- `.prettierrc` — Prettier config: arrowParens avoid, trailingComma all
- `.prettierignore` — Ditto
- `tsconfig.json` — Ditto
- `bun.lock` — Ditto
- `node_modules/` — Dependencies; do not list files

### `packages/` — Published plugin packages; navigate via subindexes

- `opencode-plugin/` — OpenCode plugin package (`magic-compact`): compaction, trimming, stats, omission storage → `opencode-plugin.md`
- `claude-code-plugin/` — Claude Code plugin package (`claude-magic-compact`): hooks, transcript compaction, MCP omission retrieval → `claude-code-plugin.md`
- `common/` — Shared package (`@magic-compact/common`); `src/index.ts` is currently an empty placeholder

### `scripts/` — Release and maintenance scripts

- `release-claude.sh` — Claude release flow: version bump, manifest sync, commit, tag, push
- `release-opencode.sh` — OpenCode release flow: version bump, commit, tag, push

### Other directories

- `.github/` — GitHub workflows and metadata
- `.githooks/` — Repository git hooks
- `.claude-plugin/` — Claude Code plugin manifest
