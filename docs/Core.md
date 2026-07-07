# Magic Compact Core

Source of truth for behavior shared by every Magic Compact implementation.

## Goal

Compress a conversation without flattening it into a single generic recap.

## Core Behavior

- `/magic-compact [N]` compacts the current conversation in place.
- `N` keeps the most recent assistant turns unchanged. Default: `0`.
- The plugin creates a backup before mutating the conversation.
- User messages are preserved exactly.
- Older assistant turns are summarized turn-by-turn, not merged into one blob.
- Useful tool calls stay visible; bulky tool I/O is replaced with retrievable omission records.
- Re-running compaction later preserves earlier summaries and compacts newer turns.
- `/magic-stats` shows cumulative savings for the current conversation.
- `read_omitted_content` retrieves omitted tool content by Content ID.

## Safety

- If compaction fails, the attempt aborts.
- If a backup exists, it is used for recovery.

## Stats (Only where possible)

- Track tokens pruned, cached-read tokens saved, and estimated money saved per conversation.
