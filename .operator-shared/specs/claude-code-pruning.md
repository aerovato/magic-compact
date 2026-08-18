# Claude Code Pruning Specification

Tool I/O pruning rules for Magic Compact on Claude Code. Shared behavior lives in [`operator.md`](../operator.md). Runtime behavior lives in [`claude-code.md`](claude-code.md).

## Thresholds

- DEFAULT_LIMIT: 128 words / 1024 chars.
- AGENT_OUTPUT_LIMIT: 512 words / 4096 chars.
- Content exceeds a limit when word count > limit.words OR char count > limit.chars.

## General Rule

All tool outputs fall under DEFAULT_LIMIT unless explicitly overridden. If output exceeds the threshold, cache the original and replace with an output omission notice.

Tool inputs are left untouched unless explicitly listed below.

## Output Rules

### Always Omit, Cache with Omission Notice

Stale or reloadable content:

- `Read` — file text, image base64, notebook cells, PDF base64. Reloadable via a new Read.
- `NotebookEdit` — `original_file` and `updated_file` are full notebook JSON. Reloadable by re-reading the notebook.

### Discard Without Caching

Redundant or trivially reloadable:

- `Skill` — instruction text or forked result. Reloadable by re-invoking the skill.

### Higher Threshold (512w / 4096c)

High-signal results:

- `Agent` (sync) — `content` array contains subagent result text.
- `TaskOutput` — `task.output` may contain high-signal background task or agent results.

### Always Preserve

Captures explicit user decisions:

- `AskUserQuestion` — `questions`, `answers`, `annotations`.

### Default Threshold Catch-All

Everything else (Bash, Write, Edit, WebSearch, Workflow, SendMessage, ReportFindings, Task*, Cron*, Plan*, Worktree*, ScheduleWakeup): if output exceeds DEFAULT_LIMIT, cache original and replace with omission notice.

## Input Rules

### Cache, Replace with "[Omitted]" at DEFAULT_LIMIT

- `Write.content` — full file content being written.
- `Edit.old_string` + `Edit.new_string` (combined) — edit payload.
- `NotebookEdit.new_source` — new cell source code.
- `Agent.prompt` — subagent task description.
- `Workflow.script` — inline JS orchestration code.
- `SendMessage.message` — inter-agent message content.
- `ReportFindings.findings` — structured findings array.

### Cache Full, Truncate Visible at 1024 Chars

- `Bash.command` — full command cached. Visible input truncated to first 512 chars + `[REST OF COMMAND TRUNCATED]`. Omission notice attached with content ID.

### Always Preserve

- `AskUserQuestion.questions` — captures user decisions.

## Tool Part State

- Only completed tool parts are pruned.
- Pending, running, and error-state tool parts are preserved as-is.
