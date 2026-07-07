# Claude Code Behavior Specification

Claude Code-specific runtime behavior. Shared plugin behavior lives in [`Core.md`](Core.md). Tool pruning rules live in [`Pruning.md`](../internal/Specs/ClaudeCode/Pruning.md).

## Commands

- `/magic-compact [N]` creates a compacted destination Claude Code session.
- `/magic-compact:magic-compact [N]` is also accepted because plugin skills are namespaced.
- `/magic-stats` is not implemented for Claude Code.

Claude Code does not currently provide a clean first-class stats tracking and injection mechanism comparable to OpenCode, so stats are intentionally omitted.

## Runtime Model

- Claude Code stores sessions as append-only JSONL transcript files under `~/.claude/projects/{sanitizedCwd}/{sessionId}.jsonl`.
- Claude Code keeps active session state in process memory.
- A plugin cannot silently switch the active interactive session after writing a new transcript.
- Magic Compact therefore uses copy-on-write compaction and asks the user to resume the new session.

This differs from OpenCode, where Magic Compact mutates the current session in place after first creating a backup.

### Platform Constraints

- **No hot reload:** a plugin cannot load new transcript data into the running Claude Code process.
- **No programmatic session switch:** switching the active session requires a user-run `/resume` command.
- **No custom top-level entry types:** transcript extensions must use valid `user`, `assistant`, `attachment`, or `system` rows with namespaced extra fields, not novel row types.

## Hook Interception

- The plugin registers a `UserPromptSubmit` command hook in `hooks/hooks.json`.
- The hook matcher accepts both `/magic-compact` and `/magic-compact:magic-compact`.
- The hook parses `N`; default is `0`.
- Invalid arguments fail the hook with a user-facing usage error.
- On success or no-op, the hook returns `continue: false` so Claude Code does not send the slash command to the model.
- User-facing completion text is returned through `stopReason`.
- The hook timeout is `150` seconds because compaction includes summary generation and transcript synthesis; Claude Code's default prompt-submit timeout is too short for real compaction work.

Success message:

```text
Magic Compact success.
To enter the compacted session, run the following command:
/resume <new-session-id>
```

## Skill Shim

- The plugin includes `skills/magic-compact/SKILL.md` so the command appears as a plugin skill.
- The skill is only a shim.
- If the model sees the skill text, the hook failed to intercept the command.
- The skill tells the model to alert the user and suggest checking that the plugin is installed and enabled.

## Compaction Flow

1. Parse the hook input and command arguments.
2. Allocate a fresh destination session file.
3. Load the current transcript's active post-boundary chain.
4. Build assistant turns from that active chain.
5. Stop early and delete the destination transcript if nothing is eligible.
6. Copy the current transcript to a temporary analysis session.
7. Run `claude -p --resume <analysis-session-id> <prompt>` to generate per-turn summaries.
8. Parse the XML summaries.
9. Delete the temporary analysis transcript.
10. Preserve safe session metadata rows in the destination transcript.
11. Write a new `system` compact boundary and rebuilt post-boundary compacted rows to the destination transcript.
12. Save the destination omission cache.
13. Return a `/resume <new-session-id>` handoff message.

## Destination Sessions

- The original active session is not modified.
- The destination session is a newly synthesized transcript, not a full copy of the original file.
- The destination contains preserved safe session metadata rows plus the rebuilt compacted conversation chain only.
- Original pre-compaction conversation rows are not copied into the destination transcript.
- On `/resume`, Claude Code loads the destination transcript's compacted chain.
- No separate backup session is created because the original session remains untouched.

This differs from OpenCode's backup-first in-place mutation model.

## Active Chain Loading

- Magic Compact reads transcript rows from the current source JSONL file.
- Only transcript row types are considered: `user`, `assistant`, `attachment`, and `system`.
- Rows before the latest `system` row with `subtype: "compact_boundary"` are excluded from active compaction planning.
- The active leaf is the newest user or assistant row not referenced as another row's parent.
- The chain is reconstructed by walking `parentUuid` from that leaf.
- Parallel assistant/tool-result rows that a single parent walk can orphan are recovered.
- Recovered rows are inserted after the last on-chain assistant row with the same `message.id` and sorted by timestamp.

The parallel recovery mirrors Claude Code's transcript loader behavior so compaction does not silently drop sibling streamed tool calls.

## Turn Selection

- Turns are built from active chain rows.
- A turn starts with one or more human user rows.
- Tool-result user rows are not treated as human user prompts.
- Assistant rows and tool-result rows after a user group belong to that turn.
- Only turns containing assistant rows or tool-result rows are eligible.
- `N` preserves the most recent eligible turns from the current uncompacted range.

## Recompaction

- Previously summarized Claude Code turns are detected by a row-level `magicCompact.summary === true` marker.
- Recompaction starts after the latest turn containing that marker.
- Earlier summarized turns are copied into the new post-boundary chain as prefix turns.

This differs from OpenCode, where the recompaction boundary is a user text part with `metadata.magicCompact.boundary === true`.

## Summarization

- The summary prompt is aligned with OpenCode's XML template.
- Summary generation runs in a temporary analysis copy using `claude -p --resume`.
- The prompt and summary generation stream do not appear in the original session.
- The generated XML must contain one `<assistant>` summary for each summarized turn.
- Each summarized turn is rebuilt with original user rows, one synthetic assistant summary row, and selected tool rows.
- The summary row is marked with `magicCompact.summary === true`.

Claude Code uses an analysis transcript because it does not expose OpenCode-style session APIs for ephemeral no-reply prompting and part mutation.

## Compact Boundary

- The compacted tail starts with a Claude-native compact boundary row: `type: "system"`, `subtype: "compact_boundary"`, `parentUuid: null`.
- `logicalParentUuid` points to the last source row represented by the compaction plan.
- Rows written after the boundary form the active compacted chain.

This differs from OpenCode's synthetic user boundary notice.

## Row Rebuilding

- New rows receive fresh `uuid` values.
- New rows use the destination `sessionId`.
- New rows get a common compaction timestamp.
- `parentUuid` links are rebuilt to form a valid post-boundary chain.
- Safe preserved metadata rows are copied into the destination transcript with the destination `sessionId`.
- Preserved turns are copied verbatim except for session, timestamp, UUID, and parent relinking.
- Summarized assistant text/thinking rows are replaced by a single summary assistant row.
- Tool-use and tool-result rows in summarized turns are preserved when useful and pruned according to `Pruning.md`.

## Omission Cache

- Location: `~/.claude/magic-compact/{sessionId}.json`.
- Cache format version is `1`.
- IDs include the last 12 characters of the destination session UUID: `<session-suffix>:omitted-###`.
- Example: `a1b2c3d4e5f6:omitted-001`.
- The session suffix is included because Claude Code MCP tool calls do not provide session IDs.
- Retrieval resolves the cache file by matching the suffix against `{sessionId}.json`.

This differs from OpenCode, where omission IDs are session-local sequential IDs and the tool receives `context.sessionID`.

## Omission Retrieval

- The plugin registers a local MCP server through `.mcp.json`.
- The MCP server exposes `read_omitted_content`.
- The tool accepts one argument: `contentId`.
- The tool reads the matching Magic Compact cache and returns the original omitted content.
- If no matching cache entry exists, it returns a not-found message.

The MCP server is a minimal stdio-based server implemented using `@modelcontextprotocol/sdk`.

## Pruning

- Pruning applies only to summarized turns.
- Only completed tool calls are pruned.
- Error-state tool results are preserved.
- `AskUserQuestion` input and output are preserved.
- `Read` and `NotebookEdit` outputs are always cached and omitted.
- `Skill` output is discarded without caching.
- `Agent` and `TaskOutput` outputs use the higher threshold from `Pruning.md`.
- Default output threshold is 128 words or 1024 characters.
- Large selected inputs are cached and replaced with omission notices according to `Pruning.md`.

## Error Handling

- Any hook parsing, transcript reading, summary generation, XML parsing, cache, or pruning failure aborts the attempt.
- Because the original session is untouched, failure recovery does not promote a backup.
- If compaction determines there is nothing to compact, the unused destination transcript path is discarded.
- Temporary analysis transcripts are deleted in cleanup after summary generation.
- The hook returns `continue: false` with a failure `stopReason` so Claude Code does not continue handling the slash command as normal prompt input.

## Current Divergences From Core/OpenCode

- Claude Code creates a destination session instead of compacting in place.
- Claude Code does not create a backup session because the original session is the backup.
- Claude Code requires the user to run `/resume <new-session-id>`.
- Claude Code does not implement `/magic-stats`.
- Claude Code uses a native `system` compact boundary instead of a synthetic user boundary part.
- Claude Code stores summary markers on transcript rows instead of OpenCode text part metadata.
- Claude Code omission IDs include a session suffix because MCP tool calls do not provide the current session ID.
- Claude Code omission retrieval is exposed through a plugin MCP server instead of an OpenCode plugin tool surface.
