import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type JsonRecord = Record<string, unknown>;

export type TranscriptRow = JsonRecord & {
  type: "user" | "assistant" | "attachment" | "system";
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  message?: JsonRecord;
  subtype?: string;
  isSidechain?: boolean;
};

export type TranscriptCopy = {
  sessionId: string;
  transcriptPath: string;
};

export type Turn = {
  userRows: TranscriptRow[];
  rows: TranscriptRow[];
};

export async function readActiveTranscriptRows(
  transcriptPath: string,
): Promise<TranscriptRow[]> {
  const rows = await readTranscriptRows(transcriptPath);
  const lastBoundaryIndex = rows.findLastIndex(isCompactBoundary);
  return buildActiveChain(
    lastBoundaryIndex === -1 ? rows : rows.slice(lastBoundaryIndex + 1),
  );
}

export async function copyTranscriptToNewSession(
  sourceTranscriptPath: string,
): Promise<TranscriptCopy> {
  const destination = await createTranscriptSession(sourceTranscriptPath);
  await copyFile(
    sourceTranscriptPath,
    destination.transcriptPath,
    constants.COPYFILE_EXCL,
  );
  return destination;
}

export async function createTranscriptSession(
  sourceTranscriptPath: string,
): Promise<TranscriptCopy> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const sessionId = randomUUID();
    const transcriptPath = join(
      dirname(sourceTranscriptPath),
      `${sessionId}.jsonl`,
    );

    try {
      await access(transcriptPath, constants.F_OK);
    } catch (error) {
      if (isRecord(error) && error["code"] === "ENOENT") {
        return { sessionId, transcriptPath };
      }

      throw error;
    }
  }

  throw new Error("Unable to create a unique transcript session.");
}

export async function readPreservedMetadataEntries(
  transcriptPath: string,
  sourceSessionId: string,
  destinationSessionId: string,
): Promise<JsonRecord[]> {
  const entries = await readTranscriptEntries(transcriptPath);
  return entries
    .filter(
      (entry): entry is JsonRecord =>
        isRecord(entry)
        && !isTranscriptRow(entry)
        && isPreservedMetadataEntry(entry),
    )
    .map(entry => rewriteSessionMetadata(entry, sourceSessionId, destinationSessionId));
}

export async function writeTranscriptEntries(
  transcriptPath: string,
  entries: JsonRecord[],
): Promise<void> {
  await Bun.write(
    transcriptPath,
    `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`,
  );
}

export async function readTranscriptRows(
  transcriptPath: string,
): Promise<TranscriptRow[]> {
  const entries = await readTranscriptEntries(transcriptPath);
  return entries.filter(isTranscriptRow);
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

export function buildAssistantTurns(rows: TranscriptRow[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;
  let assistantStarted = false;

  for (const row of rows) {
    if (isHumanUserRow(row)) {
      if (!currentTurn || assistantStarted) {
        currentTurn = { userRows: [], rows: [] };
        turns.push(currentTurn);
        assistantStarted = false;
      }
      currentTurn.userRows.push(row);
      currentTurn.rows.push(row);
      continue;
    }

    if (!currentTurn) {
      continue;
    }

    currentTurn.rows.push(row);
    if (row.type === "assistant" || isToolResultRow(row)) {
      assistantStarted = true;
    }
  }

  return turns.filter(turn =>
    turn.rows.some(row => row.type === "assistant" || isToolResultRow(row)),
  );
}

function buildActiveChain(rows: TranscriptRow[]): TranscriptRow[] {
  const rowsByUuid = new Map(rows.map(row => [row.uuid, row]));
  const parentUuids = new Set(
    rows
      .map(row => row.parentUuid)
      .filter((uuid): uuid is string => uuid !== null),
  );
  const leaf = [...rows]
    .reverse()
    .find(
      row =>
        (row.type === "user" || row.type === "assistant")
        && !parentUuids.has(row.uuid),
    );
  if (!leaf) {
    return [];
  }

  const chain: TranscriptRow[] = [];
  const seen = new Set<string>();
  let current: TranscriptRow | undefined = leaf;
  while (current) {
    if (seen.has(current.uuid)) {
      throw new Error("Cycle detected in transcript parentUuid chain.");
    }
    seen.add(current.uuid);
    chain.push(current);
    current = current.parentUuid
      ? rowsByUuid.get(current.parentUuid)
      : undefined;
  }

  return recoverParallelToolRows(rows, chain.reverse(), seen);
}

function recoverParallelToolRows(
  rows: TranscriptRow[],
  chain: TranscriptRow[],
  seen: Set<string>,
): TranscriptRow[] {
  const inserts = new Map<string, TranscriptRow[]>();
  const processedMessageIds = new Set<string>();
  const assistantRows = chain.filter(row => row.type === "assistant");
  const anchorByMessageId = new Map<string, TranscriptRow>();
  for (const assistant of assistantRows) {
    const messageId = getMessageId(assistant);
    if (messageId) {
      anchorByMessageId.set(messageId, assistant);
    }
  }

  for (const assistant of assistantRows) {
    const messageId = getMessageId(assistant);
    if (!messageId || processedMessageIds.has(messageId)) {
      continue;
    }
    processedMessageIds.add(messageId);

    const siblings = rows.filter(
      row =>
        row.type === "assistant"
        && getMessageId(row) === messageId
        && !seen.has(row.uuid),
    );
    const toolResults = rows.filter(
      row =>
        isToolResultRow(row)
        && row.parentUuid !== null
        && (row.parentUuid === assistant.uuid
          || siblings.some(sibling => sibling.uuid === row.parentUuid))
        && !seen.has(row.uuid),
    );

    if (siblings.length > 0 || toolResults.length > 0) {
      siblings.sort(compareByTimestamp);
      toolResults.sort(compareByTimestamp);
      const anchor = anchorByMessageId.get(messageId) ?? assistant;
      inserts.set(anchor.uuid, [...siblings, ...toolResults]);
      for (const row of [...siblings, ...toolResults]) {
        seen.add(row.uuid);
      }
    }
  }

  return chain.flatMap(row => [row, ...(inserts.get(row.uuid) ?? [])]);
}

function compareByTimestamp(a: TranscriptRow, b: TranscriptRow): number {
  return a.timestamp.localeCompare(b.timestamp);
}

function isCompactBoundary(row: TranscriptRow): boolean {
  return row.type === "system" && row.subtype === "compact_boundary";
}

function isToolResultRow(row: TranscriptRow): boolean {
  if (row.type !== "user" || !isRecord(row.message)) {
    return false;
  }
  const content = row.message["content"];
  return (
    Array.isArray(content)
    && content.some(block => isRecord(block) && block["type"] === "tool_result")
  );
}

function isHumanUserRow(row: TranscriptRow): boolean {
  return row.type === "user" && !isToolResultRow(row) && row.isMeta !== true;
}

function getMessageId(row: TranscriptRow): string | null {
  return isRecord(row.message) && typeof row.message["id"] === "string"
    ? row.message["id"]
    : null;
}

function isTranscriptRow(value: unknown): value is TranscriptRow {
  return (
    isRecord(value)
    && typeof value["uuid"] === "string"
    && (value["type"] === "user"
      || value["type"] === "assistant"
      || value["type"] === "attachment"
      || value["type"] === "system")
  );
}

async function readTranscriptEntries(
  transcriptPath: string,
): Promise<unknown[]> {
  const content = await readFile(transcriptPath, "utf8");
  return content
    .split("\n")
    .filter(line => line.trim() !== "")
    .map(line => JSON.parse(line) as unknown);
}

function isPreservedMetadataEntry(entry: JsonRecord): boolean {
  return PRESERVED_METADATA_TYPES.has(String(entry["type"]));
}

function rewriteSessionMetadata(
  entry: JsonRecord,
  sourceSessionId: string,
  destinationSessionId: string,
): JsonRecord {
  const copied = structuredClone(entry) as JsonRecord;
  if (copied["sessionId"] === sourceSessionId) {
    copied["sessionId"] = destinationSessionId;
  }
  return copied;
}

const PRESERVED_METADATA_TYPES = new Set([
  "custom-title",
  "ai-title",
  "last-prompt",
  "tag",
  "agent-name",
  "agent-color",
  "agent-setting",
  "mode",
  "worktree-state",
  "pr-link",
  "task-summary",
  "permission-mode",
]);
