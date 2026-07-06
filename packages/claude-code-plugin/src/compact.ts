import { randomUUID } from "node:crypto";
import { appendFile, unlink } from "node:fs/promises";
import { loadOmissionCache, saveOmissionCache } from "./omission";
import { pruneTranscriptRow } from "./prune";
import {
  buildAssistantTurns,
  copyTranscriptToNewSession,
  isRecord,
  readActiveTranscriptRows,
  type Turn,
  type TranscriptRow,
} from "./transcript";

type Plan = {
  prefixTurns: Turn[];
  summarizedTurns: Turn[];
  preservedTurns: Turn[];
  baseRow: TranscriptRow;
};

export async function compactTranscript(
  transcriptPath: string,
  sessionId: string,
  keepTurns: number,
): Promise<boolean> {
  const rows = await readActiveTranscriptRows(transcriptPath);
  const plan = createPlan(rows, keepTurns);
  if (plan.summarizedTurns.length === 0) {
    return false;
  }

  const summaries = await generateSummaries(
    transcriptPath,
    plan.summarizedTurns,
    plan.preservedTurns[0] ?? null,
  );
  const compactedRows = await buildCompactedRows(plan, summaries, sessionId);
  await appendFile(
    transcriptPath,
    `${compactedRows.map(row => JSON.stringify(row)).join("\n")}\n`,
  );
  return true;
}

function createPlan(rows: TranscriptRow[], keepTurns: number): Plan {
  const baseRow = rows.find(
    row => row.type === "user" || row.type === "assistant",
  );
  if (!baseRow) {
    throw new Error(
      "Transcript does not contain compactable conversation rows.",
    );
  }

  const turns = buildAssistantTurns(rows);
  const compactionStartIndex =
    turns.findLastIndex(turn => turn.rows.some(isMagicCompactSummaryRow)) + 1;
  const compactionEndIndex =
    keepTurns <= 0
      ? turns.length
      : Math.max(compactionStartIndex, turns.length - keepTurns);

  return {
    prefixTurns: turns.slice(0, compactionStartIndex),
    summarizedTurns: turns.slice(compactionStartIndex, compactionEndIndex),
    preservedTurns: turns.slice(compactionEndIndex),
    baseRow,
  };
}

async function generateSummaries(
  transcriptPath: string,
  turns: Turn[],
  nextTurn: Turn | null,
): Promise<string[]> {
  const analysis = await copyTranscriptToNewSession(transcriptPath);
  const prompt = buildCompactionPrompt(turns, nextTurn);

  try {
    const summaryProcess = Bun.spawn(
      ["claude", "-p", "--resume", analysis.sessionId, prompt],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(summaryProcess.stdout).text(),
      new Response(summaryProcess.stderr).text(),
      summaryProcess.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(`Summary generation failed: ${stderr.trim()}`);
    }

    return parseSummaries(stdout, turns.length);
  } finally {
    await unlink(analysis.transcriptPath).catch(() => undefined);
  }
}

async function buildCompactedRows(
  plan: Plan,
  summaries: string[],
  sessionId: string,
): Promise<TranscriptRow[]> {
  const rows: TranscriptRow[] = [];
  const copiedUuids = new Map<string, string>();
  const completedToolUseIds = collectCompletedToolUseIds(plan.summarizedTurns);
  const toolNamesById = collectToolNamesById(plan.summarizedTurns);
  const omissionCache = await loadOmissionCache(sessionId);
  const timestamp = new Date().toISOString();
  const lastOriginalRow = sourceTurns(plan)
    .flatMap(turn => turn.rows)
    .at(-1);
  if (!lastOriginalRow) {
    throw new Error("Compaction plan has no source rows.");
  }

  const boundaryUuid = randomUUID();
  rows.push({
    ...copySessionFields(plan.baseRow, sessionId, timestamp),
    type: "system",
    subtype: "compact_boundary",
    content: "Conversation compacted",
    level: "info",
    isMeta: false,
    uuid: boundaryUuid,
    parentUuid: null,
    logicalParentUuid: lastOriginalRow.uuid,
    compactMetadata: {
      trigger: "manual",
      preTokens: 0,
      messagesSummarized: plan.summarizedTurns.flatMap(turn => turn.rows)
        .length,
    },
  });
  let parentUuid: string | null = boundaryUuid;

  for (const turn of plan.prefixTurns) {
    parentUuid = copyTurnRows(
      turn,
      rows,
      copiedUuids,
      sessionId,
      timestamp,
      parentUuid,
    );
  }

  for (const [index, turn] of plan.summarizedTurns.entries()) {
    for (const row of turn.userRows) {
      const copied = copyRow(row, sessionId, timestamp, parentUuid);
      copiedUuids.set(row.uuid, copied.uuid);
      rows.push(copied);
      parentUuid = copied.uuid;
    }

    const firstAssistant = turn.rows.find(row => row.type === "assistant");
    if (!firstAssistant) {
      throw new Error("Turn missing assistant row for summary shape.");
    }

    const summary = summaries[index];
    if (summary === undefined) {
      throw new Error("Missing summary for compacted turn.");
    }

    const copied = createAssistantSummaryRow(
      firstAssistant,
      sessionId,
      timestamp,
      parentUuid,
      summary,
    );
    copiedUuids.set(firstAssistant.uuid, copied.uuid);
    rows.push(copied);
    parentUuid = copied.uuid;

    for (const row of turn.rows) {
      if (turn.userRows.includes(row) || !isToolRow(row)) {
        continue;
      }

      const copiedToolRow = copyRow(
        row,
        sessionId,
        timestamp,
        row.parentUuid
          ? (copiedUuids.get(row.parentUuid) ?? parentUuid)
          : parentUuid,
      );
      keepOnlyToolBlocks(copiedToolRow);
      pruneTranscriptRow(copiedToolRow, {
        cache: omissionCache,
        sessionId,
        completedToolUseIds,
        toolNamesById,
      });
      copiedUuids.set(row.uuid, copiedToolRow.uuid);
      rows.push(copiedToolRow);
      parentUuid = copiedToolRow.uuid;
    }
  }

  for (const turn of plan.preservedTurns) {
    parentUuid = copyTurnRows(
      turn,
      rows,
      copiedUuids,
      sessionId,
      timestamp,
      parentUuid,
    );
  }

  await saveOmissionCache(sessionId, omissionCache);
  return rows;
}

function copyTurnRows(
  turn: Turn,
  rows: TranscriptRow[],
  copiedUuids: Map<string, string>,
  sessionId: string,
  timestamp: string,
  initialParentUuid: string | null,
): string | null {
  let parentUuid = initialParentUuid;
  for (const row of turn.rows) {
    const copied = copyRow(
      row,
      sessionId,
      timestamp,
      row.parentUuid
        ? (copiedUuids.get(row.parentUuid) ?? parentUuid)
        : parentUuid,
    );
    copiedUuids.set(row.uuid, copied.uuid);
    rows.push(copied);
    parentUuid = copied.uuid;
  }
  return parentUuid;
}

function copyRow(
  row: TranscriptRow,
  sessionId: string,
  timestamp: string,
  parentUuid: string | null,
): TranscriptRow {
  const copied = structuredClone(row) as TranscriptRow;
  copied.uuid = randomUUID();
  copied.parentUuid = parentUuid;
  copied.sessionId = sessionId;
  copied.timestamp = timestamp;
  return copied;
}

function collectCompletedToolUseIds(turns: Turn[]): Set<string> {
  const ids = new Set<string>();
  for (const turn of turns) {
    for (const row of turn.rows) {
      if (!isRecord(row.message)) {
        continue;
      }
      const content = row.message["content"];
      if (!Array.isArray(content)) {
        continue;
      }
      for (const block of content) {
        if (
          isRecord(block)
          && block["type"] === "tool_result"
          && block["is_error"] !== true
          && typeof block["tool_use_id"] === "string"
        ) {
          ids.add(block["tool_use_id"]);
        }
      }
    }
  }
  return ids;
}

function collectToolNamesById(turns: Turn[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const turn of turns) {
    for (const row of turn.rows) {
      if (!isRecord(row.message)) {
        continue;
      }
      const content = row.message["content"];
      if (!Array.isArray(content)) {
        continue;
      }
      for (const block of content) {
        if (
          isRecord(block)
          && block["type"] === "tool_use"
          && typeof block["id"] === "string"
          && typeof block["name"] === "string"
        ) {
          names.set(block["id"], block["name"]);
        }
      }
    }
  }
  return names;
}

function isToolRow(row: TranscriptRow): boolean {
  if (!isRecord(row.message)) {
    return false;
  }

  const content = row.message["content"];
  return (
    Array.isArray(content)
    && content.some(
      block =>
        isRecord(block)
        && (block["type"] === "tool_use" || block["type"] === "tool_result"),
    )
  );
}

function keepOnlyToolBlocks(row: TranscriptRow): void {
  if (!isRecord(row.message)) {
    return;
  }

  const content = row.message["content"];
  if (!Array.isArray(content)) {
    return;
  }

  row.message["content"] = content.filter(
    block =>
      isRecord(block)
      && (block["type"] === "tool_use" || block["type"] === "tool_result"),
  );
}

function isMagicCompactSummaryRow(row: TranscriptRow): boolean {
  const magicCompact = row["magicCompact"];
  return isRecord(magicCompact) && magicCompact["summary"] === true;
}

function sourceTurns(plan: Plan): Turn[] {
  return [...plan.prefixTurns, ...plan.summarizedTurns, ...plan.preservedTurns];
}

function createAssistantSummaryRow(
  source: TranscriptRow,
  sessionId: string,
  timestamp: string,
  parentUuid: string | null,
  summary: string,
): TranscriptRow {
  const copied = structuredClone(source) as TranscriptRow;
  copied.uuid = randomUUID();
  copied.parentUuid = parentUuid;
  copied.sessionId = sessionId;
  copied.timestamp = timestamp;
  copied.message = {
    ...source.message,
    id: `msg_${randomUUID()}`,
    role: "assistant",
    content: [{ type: "text", text: summary }],
    stop_reason: "end_turn",
    stop_sequence: null,
  };
  copied["magicCompact"] = { summary: true };
  return copied;
}

function copySessionFields(
  row: TranscriptRow,
  sessionId: string,
  timestamp: string,
): TranscriptRow {
  const copied = structuredClone(row) as TranscriptRow;
  copied.sessionId = sessionId;
  copied.timestamp = timestamp;
  copied.isSidechain = false;
  delete copied.message;
  return copied;
}

function buildCompactionPrompt(turns: Turn[], nextTurn: Turn | null): string {
  return `<system>
# Attention: Conversation Compaction Required

The current conversation is reaching the maximum allowed conversation size. In order to continue, earlier unsummarized parts of the conversation must be summarized.

## Next Task

In order to continue, a subset of earlier non-compacted **assistant turns** of this conversation must be summarized. An assistant turn encompasses all messages (including tool calls and results) sent by an assistant between one user request and the next user request.

Next task: Summarize the conversation by **outputting exactly the XML structure shown below** but with all assistant turns summarized. Replace all placeholder text with your summary of the turn. **Your response should start with the <summary> tag and end with the closing </summary> tag.**

${buildXmlTemplate(turns, nextTurn)}

## Output Guidelines:

- **Output the truncated text within the <user> </user> tags exactly** according to the XML template above
  - User prompts are intentionally truncated to only parts of the first line for brevity.
  - Therefore, only output PARTS OF THE FIRST LINE. DO NOT OUTPUT the entire user prompt.
- Output your summary for assistant turns within the <assistant> </assistant> tags
  - You are **only responsible** for summarizing the specific assistant turns specified within the XML structure
  - Do not summarize any other assistant turns not specified in the XML template above.
- Do not think. Do not call any tools. Output the summary ONLY.
- **Follow the template.** Your response should start with the <summary> tag and end with the closing </summary> tag.

## Summarization Guidelines:

- Summarize everything between one user message and the next
- Keep your summaries short and direct
  - Try to keep your summaries under 200 words whenever possible
  - You may go over 200 words to preserve summary quality if the assistant turn was genuinely long
- In your summary, include:
  - Relevant decisions and thought process, including plans if any was presented
  - Very brief bullet point summary of your workflow
  - Final results and summarized output to the user
- All tool calls are preserved and automatically included with your summary
  - Therefore, you **do not need to restate details about what tools you used or with what arguments**
- Do not mention this summarization process; your summaries should naturally replace the assistant's turn within the flow of the conversation
</system>`;
}

function buildXmlTemplate(turns: Turn[], nextTurn: Turn | null): string {
  const parts: string[] = [];
  parts.push("<summary>");
  parts.push(
    ...turns.map(turn =>
      `
<user>
${getUserPromptText(turn)}
</user>
<assistant>
[**Replace: Your summary of the assistant turn**]
</assistant>
`.trim(),
    ),
  );

  if (nextTurn) {
    parts.push(
      `
<user>
${getUserPromptText(nextTurn)}
</user>
`.trim(),
    );
  }
  parts.push("</summary>");
  return parts.join("\n");
}

function getUserPromptText(turn: Turn): string {
  const text = turn.userRows
    .map(row => getUserText(row))
    .filter(Boolean)
    .join("\n");
  const firstLine = text.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.length <= 300
    ? `${firstLine}\n...`
    : `${firstLine.slice(0, 300).trim()}...`;
}

function parseSummaries(responseText: string, expectedCount: number): string[] {
  const start = responseText.indexOf("<summary>");
  const end = responseText.lastIndexOf("</summary>");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "Summary response did not include a complete <summary> block.",
    );
  }

  const summary = responseText.slice(start, end + "</summary>".length);
  const matches = [
    ...summary.matchAll(/<assistant>([\s\S]*?)<\/assistant>/g),
  ].map(match => match[1]!.trim());
  if (matches.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} summaries, received ${matches.length}.`,
    );
  }
  return matches;
}

function getUserText(row: TranscriptRow): string {
  if (!isRecord(row.message)) {
    return "";
  }

  const content = row.message["content"];
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map(block =>
      isRecord(block) && typeof block["text"] === "string" ? block["text"] : "",
    )
    .filter(Boolean)
    .join("\n");
}
