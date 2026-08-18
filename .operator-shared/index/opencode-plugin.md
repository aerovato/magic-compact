---
description: Index of packages/opencode-plugin — the OpenCode plugin package (magic-compact): compaction, trimming, stats, and omission storage.
read_if: Working on the OpenCode plugin; read before exploring or modifying this package.
---

# OpenCode Plugin Package

## Coverage

- `packages/opencode-plugin/` — the `magic-compact` OpenCode plugin package.

## Architecture

- Entry point `src/index.ts` (default export `server`); `src/tui.ts` is the TUI plugin entry.
- Command executors (`src/magic-*.ts`) delegate to `src/compact/` planning and pruning, `src/stats/` accounting, and `src/storage/` persistence via the V2 SDK client from `src/api.ts`.
- Storage layer persists per-session stats and omission records under a plugin storage directory.

## `packages/opencode-plugin` Index

- `package.json` — Published as `magic-compact`

### `src/` — Plugin source

- `index.ts` — Server entry; default-exports the plugin server
- `tui.ts` — TUI plugin entry; default-exports the plugin
- `api.ts` — V2 SDK client acquisition (`getV2Client`) and response unwrapping (`unwrap`)
- `magic-compact.ts` — `/magic-compact` command executor
- `magic-trim.ts` — `/magic-trim` command executor
- `magic-stats.ts` — `/magic-stats` command executor
- `util.ts` — Small runtime guards (`isRecord`, `unwrapString`)

#### `src/compact/` — Compaction core

- `plan.ts` — Turn model and `CompactionPlan` / `TrimPlan` planning
- `compact.ts` — `compactSession` driver and `CompactSessionResult`
- `prune.ts` — `pruneSummarizedTurns` and `trimToolParts` mutations
- `session.ts` — Backup create/apply, metadata, progress-notice injection
- `template.ts` — Compaction prompt builder (`buildCompactionPrompt`)
- `constants.ts` — Post-compaction notice, boundary metadata, part-ID helpers

#### `src/stats/` — Stats accounting

- `events.ts` — `handleStatsEvent` event ingestion
- `tokenize.ts` — Session token counting and provider token lookup
- `pricing.ts` — Cached per-model read pricing
- `constants.ts` — Stats metadata and stats/trim summary message builders

#### `src/storage/` — Persistence

- `store.ts` — Plugin storage directory and JSON file read/write helpers
- `omission.ts` — Omission entry/cache schemas and `allocateOmission`
- `stats.ts` — `ConversationStats` schema, read/write/copy

### `test/` — Tests

- `compact.test.ts` — Compaction prompt-setting and ephemeral-session tests
- `trim.test.ts` — Trim planning and metadata idempotency tests
