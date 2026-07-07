# Project

Magic Compact is a lossless context compression plugin for OpenCode and Claude Code. See `README.md` for the user-facing overview, features, installation, source map, and pruning rules.

This file is the development reference for agents working on this repo.

---

## Development Docs

Agents MUST read these files before working on platform behavior, and MUST update them whenever behavior changes:

- `docs/Development.md` — setup, repository layout, and maintenance commands.
- `docs/Core.md` — shared, platform-independent behavior and safety guarantees.
- `docs/OpenCode.md` — OpenCode runtime behavior specification.
- `docs/ClaudeCode.md` — Claude Code runtime behavior specification.

---

## Architecture

Magic Compact performs per-turn conversation compaction while preserving the conversation skeleton.

### Runtime Surfaces

- `/magic-compact [N]` slash command.
- `/magic-stats` slash command (OpenCode exclusive).
- `read_omitted_content` tool.

### Goals

- Preserve the current conversation structure while reducing context size.
- Preserve user messages exactly.
- Replace old assistant turns with local per-turn summaries.
- Keep useful tool calls visible while removing bulky tool I/O.
- Store omitted tool I/O outside context but make it retrievable.
- Keep a recovery path available on failure.
