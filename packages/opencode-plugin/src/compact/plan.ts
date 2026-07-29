import type { Message, Part } from "@opencode-ai/sdk/v2";
import { unwrap, type V2Client } from "../api";
import { isRecord } from "../util";

export type MessageWithParts = {
  info: Message;
  parts: Part[];
};

export type Turn = {
  user: MessageWithParts[];
  assistants: MessageWithParts[];
};

export type CompactionPlan = {
  summarizedTurns: Turn[];
  nextTurn: Turn | null;
};

export type TrimPlan = {
  trimmedTurns: Turn[];
};

export async function createCompactionPlan(
  v2: V2Client,
  sessionID: string,
  keepTurns: number,
): Promise<CompactionPlan> {
  const turns = await loadTurns(v2, sessionID);

  const boundaryTurnIndex = turns.findLastIndex(turn =>
    turn.user.some(msg => msg.parts.some(isBoundaryPart)),
  );
  const compactionStartIndex = boundaryTurnIndex === -1 ? 0 : boundaryTurnIndex;

  removeTrailingAssistantlessTurn(turns);

  const compactionEndIndex =
    keepTurns <= 0
      ? turns.length
      : Math.max(compactionStartIndex, turns.length - keepTurns);

  const summarizedTurns = turns.slice(compactionStartIndex, compactionEndIndex);

  const nextTurn = turns[compactionEndIndex] ?? null;

  return {
    summarizedTurns,
    nextTurn,
  };
}

export async function createTrimPlan(
  v2: V2Client,
  sessionID: string,
  keepTurns: number,
): Promise<TrimPlan> {
  const turns = await loadTurns(v2, sessionID);
  removeTrailingAssistantlessTurn(turns);
  const trimEndIndex = Math.max(0, turns.length - keepTurns);

  return {
    trimmedTurns: turns.slice(0, trimEndIndex),
  };
}

async function loadTurns(v2: V2Client, sessionID: string): Promise<Turn[]> {
  const messages: MessageWithParts[] = unwrap(
    await v2.session.messages({
      sessionID,
    }),
  );
  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;

  for (const message of messages) {
    if (message.info.role === "user") {
      if (currentTurn && currentTurn.assistants.length > 0) {
        currentTurn = null;
      }
      if (!currentTurn) {
        currentTurn = { user: [], assistants: [] };
        turns.push(currentTurn);
      }
      currentTurn.user.push(message);
      continue;
    }

    if (message.info.role === "assistant" && currentTurn) {
      currentTurn.assistants.push(message);
    }
  }

  return turns;
}

function removeTrailingAssistantlessTurn(turns: Turn[]): void {
  const lastTurn = turns.at(-1);
  if (lastTurn && lastTurn.assistants.length === 0) {
    // Last turn may consist of noReply user messages, and should not count as a real "turn"
    turns.pop();
  }
}

function isBoundaryPart(part: Part): boolean {
  if (part.type !== "text") {
    return false;
  }

  const metadata = part.metadata;
  if (!isRecord(metadata)) {
    return false;
  }

  const magicCompact = metadata["magicCompact"];
  return isRecord(magicCompact) && magicCompact["boundary"] === true;
}
