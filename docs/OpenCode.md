# OpenCode Behavior Specification

OpenCode-specific runtime behavior. Shared plugin behavior lives in [`Core.md`](Core.md).

## Commands

- `/magic-compact [N]` backs up and compacts the current OpenCode session in place.
- `/magic-stats` injects an ignored stats notice for the current session.
- `read_omitted_content` is registered as an OpenCode plugin tool.

`/magic-compact` accepts only a non-negative integer argument. `/magic-stats` accepts no arguments. Command handlers throw success, no-op, or validation messages so OpenCode does not continue sending the slash command to the LLM.

## Compaction Flow

1. Parse `N`; default is `0`.
2. Build a per-turn compaction plan for the current session.
3. Stop early with a toast if no assistant turns are eligible.
4. Load the source session and compute the next `compactionCount`.
5. Fork the session as a backup.
6. Copy omission and stats caches to the backup.
7. Rename the backup to `[Backup] ${title} ${timestamp}` and write backup metadata.
8. Measure pre-compaction tokens using provider tokens when available, otherwise local counting.
9. Insert an ignored no-reply progress message.
10. Create an ephemeral compaction session.
11. Send the XML summary prompt in the ephemeral session.
12. Parse per-turn summaries.
13. Delete the ephemeral session in cleanup.
14. Delete the progress message in cleanup.
15. Upsert deterministic summary text parts onto the first assistant message in each summarized turn.
16. Inject the post-compaction boundary notice.
17. Reload summarized turns, then prune summarized turns.
18. Update current session metadata with `compactionCount`.
19. Measure post-compaction tokens.
20. Update stats and inject an ignored stats notice.
21. Show a success toast.

## Backup Sessions

- Backup title: `[Backup] ${title} ${timestamp}`.
- The main session title stays unchanged on success.
- Backup metadata stores `sourceSessionId`, `compactedAt`, and `compactionCount`.
- The backup receives copies of omission and stats caches before mutation.
- If compaction fails after backup creation, the backup is renamed back to the original title, the original session is deleted, and OpenCode selects the backup session.

## Turn Selection

- Messages are processed oldest-first.
- A turn is one or more adjacent user messages plus all following assistant messages before the next user group.
- Consecutive user/no-reply messages stay in the same turn.
- Boundary detection runs before ignoring a trailing assistantless turn.
- A trailing user-only turn does not count against `N`.
- Only turns with assistant messages are summarized.
- `N` preserves the most recent assistant turns in the current uncompacted range.

## Recompaction

- Previously summarized turns are preserved as-is.
- Recompaction starts at the latest boundary marker.
- The boundary marker is a user text part with `metadata.magicCompact.boundary === true`.
- Earlier turns before the latest boundary are outside the current compaction range.

## Summarization

- Summaries are generated in an ephemeral session so the prompt and assistant stream stay out of the main session.
- The XML prompt is built from the OpenCode template.
- The XML prompt includes only the turns being summarized and, when needed, the next user turn as the boundary marker.
- User text in the prompt excludes synthetic and ignored text and is truncated to the first line or first 300 characters, whichever is shorter.
- The generated XML must contain one `<assistant>` summary for each summarized turn.
- Each summary is written as a text part on the first assistant message in the summarized turn.
- Summary parts use deterministic IDs: `prt_-magic_summary_${messageID}`.
- Summary parts are marked with `metadata.magicCompact.summary === true`.

## Boundary Notice

- OpenCode injects a synthetic user text part after summaries are written.
- If a next user message exists, the notice is written onto that message and the part ID sorts before normal parts.
- If no next user message exists, a no-reply synthetic user message is created.
- The notice is marked with `metadata.magicCompact.boundary === true`.
- The notice tells the model to use `read_omitted_content` only when exact omitted historical tool I/O is needed and cannot be recovered through a fresh tool call.

## Omission Cache

- Location: `${XDG_DATA_HOME:-~/.local/share}/opencode/storage/magic-compact/{sessionId}.json`.
- Cache format version is `1`.
- IDs are session-local sequential IDs: `omitted-001`, `omitted-002`, ...
- The current session cache is the active cache on success.
- The backup gets a cache copy before mutation.

## Omission Retrieval

- The plugin exposes `read_omitted_content` as an OpenCode plugin tool.
- The tool accepts one argument: `contentId`.
- The tool receives `context.sessionID` from OpenCode and reads that session's omission cache.
- If no matching cache entry exists, it returns a not-found message.

## Stats

- Stats are stored under `${XDG_DATA_HOME:-~/.local/share}/opencode/storage/magic-compact/stats/{sessionId}.json`.
- Stats cache format version is `1`.
- Stats track `rootSessionId`, `sourceSessionId`, `totalTokensPruned`, `cachedTokensSaved`, and processed assistant message IDs.
- Each compaction adds the current token reduction to `totalTokensPruned`.
- OpenCode assistant message events add `totalTokensPruned` to `cachedTokensSaved` once per assistant message after stats exist.
- `/magic-stats` injects an ignored stats summary notice, or a no-stats message if no stats exist.

## Pruning

- Pruning applies only to summarized turns after summary insertion and boundary injection.
- Synthetic user text parts are deleted unless they are preserved OpenCode wrappers or reminders.
- Summarized assistant messages keep summary parts and tool parts.
- Other assistant parts are deleted.
- Assistant messages with no remaining parts are deleted.
- Only completed tool parts are pruned; pending, running, and error states are preserved.

## Tool Rules

- `write`: omit large `input.content` and cache it.
- `edit`: omit large `oldString` and `newString` together and cache once.
- `apply_patch`: omit large `input.patchText` and cache it.
- `bash`: cache long commands and visibly truncate to the first 512 characters plus `[REST OF COMMAND TRUNCATED]`.
- `read`: always cache and omit output.
- `task`: cache and omit output only above the higher task threshold.
- `todowrite`: preserve input and replace output with a success message, no cache.
- `question`: preserve input and output.
- `skill`: preserve input and replace output with a reload hint, no cache.
- Other completed tool outputs are cached and omitted when they exceed the default threshold.

## Error Handling

- Any LLM, XML, SDK, cache, stats, token counting, or pruning failure aborts the attempt.
- Cleanup deletes the ephemeral session and progress message when they exist.
- If a backup exists, it is promoted back.
- A failure toast is shown.
- The command hook throws so OpenCode does not continue sending the slash command to the LLM.
