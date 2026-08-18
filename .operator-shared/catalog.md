# Shared Partition Catalog

## Tree

- `operator.md`
  - Description: Shared Operator Instructions: public project overview, core behavior, development workflow, dev commands, repo-established rules and code style.
  - Read If: Auto-injected.
- `catalog.md`
  - Description: This catalog.
  - Read If: Auto-injected.
- `README.md`
  - Description: Operator Memory README with install instructions.
  - Read If: Setting up Operator Memory.
- `index/index.md`
  - Description: Main publishable Project Index: repo layout, packages, scripts, and configs.
  - Read If: Auto-injected.

### `specs/` — Platform runtime behavior specifications

- `opencode.md`
  - Description: OpenCode runtime behavior specification: commands, compaction/trim flows, backups, turn selection, recompaction, summarization, boundary notice, omission cache/retrieval, stats, pruning, tool rules, error handling.
  - Read If: Working on the OpenCode plugin; update whenever behavior changes.
- `claude-code.md`
  - Description: Claude Code runtime behavior specification: commands, copy-on-write runtime model, hook interception, skill shim, compaction flow, destination sessions, active chain loading, turn selection, recompaction, summarization, compact boundary, row rebuilding, omission cache/retrieval, pruning, error handling.
  - Read If: Working on the Claude Code plugin; update whenever behavior changes.
- `claude-code-pruning.md`
  - Description: Claude Code tool I/O pruning contract: thresholds, omission cache rules, input/output rules, and tool-state safety.
  - Read If: Working on Claude Code pruning or tool omission behavior.
