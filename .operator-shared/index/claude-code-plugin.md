---
description: Index of packages/claude-code-plugin — the Claude Code plugin package (claude-magic-compact): hooks, command parsing, transcript compaction, and MCP omission retrieval.
read_if: Working on the Claude Code plugin; read before exploring or modifying this package.
---

# Claude Code Plugin Package

## Coverage

- `packages/claude-code-plugin/` — the `claude-magic-compact` Claude Code plugin package.

## Architecture

- Hook-driven: `hooks/hooks.json` wires Claude Code hook events to `src/hook.ts`, which parses `/magic-compact` invocations from prompt submissions (`src/command.ts`) and runs transcript compaction.
- Compaction operates on Claude Code transcript rows (`src/transcript.ts` → `src/compact.ts` → `src/prune.ts`), with pruned content persisted as omission records (`src/omission.ts`) retrievable via the MCP server (`src/mcp.ts`, configured by `.mcp.json`).
- `.claude-plugin/plugin.json` and `skills/magic-compact/SKILL.md` provide the plugin manifest and skill instructions.

## `packages/claude-code-plugin` Index

- `package.json` — Published as `claude-magic-compact`
- `.claude-plugin/plugin.json` — Claude Code plugin manifest
- `.mcp.json` — MCP server configuration for `read_omitted_content`
- `hooks/hooks.json` — Hook event wiring

### `skills/` — Claude Code skills

- `magic-compact/SKILL.md` — Skill instructions for the magic-compact workflow

### `src/` — Plugin source

- `index.ts` — Package entry
- `hook.ts` — Hook entrypoint handling Claude Code hook events
- `command.ts` — Hook input parsing and `/magic-compact [N]` command parsing
- `compact.ts` — `compactTranscript` compaction driver
- `prune.ts` — `pruneTranscriptRow` row-level pruning
- `transcript.ts` — Transcript row/turn/copy models and transcript access
- `omission.ts` — Omission cache load/save, `allocateOmission`, `readOmittedContent`
- `mcp.ts` — MCP server exposing `read_omitted_content`
