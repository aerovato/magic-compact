# Shared Operator Instructions

## Project

Magic Compact is a lossless context compression plugin for OpenCode and Claude Code.

A context reduction plugin that backs up and compacts conversations in place:

- Creates a backup session before destructive compaction.
- Supports OpenCode-only tool I/O trimming without summarization.
- Preserves all user messages as-is.
- Summarizes assistant turns older than the N most recent turns. Default: `0`.
- Preserves useful tool calls while pruning bulky tool I/O into retrievable omission records.
- Exposes `/magic-compact`, `/magic-trim`, `/magic-stats`, and `read_omitted_content`.

## Core Behavior

Source of truth for behavior shared by every Magic Compact implementation.

### Goal

Compress a conversation without flattening it into a single generic recap.

### Behavior

- `/magic-compact [N]` compacts the current conversation in place.
- `N` keeps the most recent assistant turns unchanged. Default: `0`.
- We also provide `/magic-trim [N]`, which applies tool I/O trimming without summarizing assistant turns.
- The plugin creates a backup before mutating the conversation.
- User messages are preserved exactly.
- Older assistant turns are summarized turn-by-turn, not merged into one blob.
- Useful tool calls stay visible; bulky tool I/O is replaced with retrievable omission records.
- Re-running compaction later preserves earlier summaries and compacts newer turns.
- `/magic-stats` shows cumulative savings for the current conversation.
- `read_omitted_content` retrieves omitted tool content by Content ID.

### Safety

- If compaction fails, the attempt aborts.
- If a backup exists, it is used for recovery.

### Stats (Only where possible)

- Track tokens pruned, cached-read tokens saved, and estimated money saved per conversation.

## Development Specs

Agents MUST read the relevant spec before working on platform behavior, and MUST update it whenever behavior changes:

- `specs/opencode.md` — **Read if working on the OpenCode plugin**: OpenCode runtime behavior specification.
- `specs/claude-code.md` — **Read if working on the Claude Code plugin**: Claude Code runtime behavior specification.
- `specs/claude-code-pruning.md` — **Read if working on Claude Code pruning**: tool I/O pruning contract.

## Development

### Requirements

- Bun

### Setup

Install dependencies from the repository root:

```bash
bun install
```

### Repository Layout

- `packages/opencode-plugin` — OpenCode plugin implementation (`magic-compact`): `src/compact/` (compaction flow, planning, pruning, session mutation), `src/storage/` (omission and stats persistence), `src/stats/` (accounting, pricing, token estimation), command entrypoints, and tests.
- `packages/claude-code-plugin` — Claude Code plugin implementation (`claude-magic-compact`): command entrypoint, compaction flow, hook integration, MCP omission retrieval, transcript parsing/pruning.
- `packages/common` — shared utilities for cross-package code.
- `.operator-shared/` — shared Operator Memory: public instructions and development specs.

### Notes

- The project uses Bun workspaces.
- For the user-facing plugin install flow, see the main `README.md`.

## Dev Commands

- `bun run typecheck` — TypeScript type checking.
- `bun run lint` — ESLint check.
- `bun run format` — Prettier format all files.

## Rules

- Never assert SDK, OpenCode session, message, part, or runtime behavior from memory or inference. Verify against relevant tests and authoritative documentation first.

## Shared Content Policy

- Shared here: main Project Index (`index/index.md`), public project instructions, development specs (`specs/`), and this overview.
