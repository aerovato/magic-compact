import type { Session, TextPart } from "@opencode-ai/sdk/v2";
import { unwrap, type V2Client } from "../api";
import { summaryMetadata, summaryPartID } from "./constants";
import { createCompactionPlan, type Turn } from "./plan";
import { buildCompactionPrompt } from "./template";

export type CompactSessionResult = {
  summarizedTurns: Turn[];
  nextTurn: Turn | null;
};

export async function compactSession(
  v2: V2Client,
  session: Session,
  sessionID: string,
  keepTurns: number,
): Promise<CompactSessionResult> {
  const plan = await createCompactionPlan(v2, sessionID, keepTurns);
  const summaries = await generateSummariesInEphemeralSession(
    v2,
    session,
    plan.summarizedTurns,
    plan.nextTurn,
  );

  await injectSummaries(v2, sessionID, plan.summarizedTurns, summaries);

  return {
    summarizedTurns: plan.summarizedTurns,
    nextTurn: plan.nextTurn,
  };
}

async function generateSummariesInEphemeralSession(
  v2: V2Client,
  session: Session,
  turns: Turn[],
  nextTurn: Turn | null,
): Promise<string[]> {
  const compactionSession = unwrap(
    await v2.session.create({
      title: `[TEMP] ${session.title}`,
      agent: session.agent,
      model: session.model
        ? {
            id: session.model.id,
            providerID: session.model.providerID,
            variant: session.model.variant,
          }
        : undefined,
    }),
  );

  try {
    return await generateSummaries(v2, compactionSession.id, turns, nextTurn);
  } finally {
    unwrap(
      await v2.session.delete({
        sessionID: compactionSession.id,
      }),
    );
  }
}

async function generateSummaries(
  v2: V2Client,
  sessionID: string,
  turns: Turn[],
  nextTurn: Turn | null,
): Promise<string[]> {
  const response = unwrap(
    await v2.session.prompt({
      sessionID,
      parts: [
        {
          type: "text",
          text: buildCompactionPrompt(turns, nextTurn),
        },
      ],
    }),
  );

  const textResponse = response.parts
    .filter((part): part is TextPart => part.type === "text")
    .map(part => part.text)
    .join("\n");

  return parseSummaries(textResponse, turns.length);
}

function parseSummaries(responseText: string, expectedCount: number): string[] {
  const summary = extractSummaryXml(responseText);
  // Models regularly append one unrequested summary for the trailing
  // next-turn <user> anchor. Pairing each echoed <user> with its following
  // <assistant> and taking the first expectedCount pairs ignores that extra
  // block while still failing loudly on a true miss.
  const segments = [
    ...summary.matchAll(/<(user|assistant)>([\s\S]*?)<\/\1>/g),
  ].map(match => ({ tag: match[1]!, text: match[2]!.trim() }));
  const matches: string[] = [];
  for (
    let index = 0;
    index < segments.length && matches.length < expectedCount;
    index++
  ) {
    const current = segments[index]!;
    const next = segments[index + 1];
    if (current.tag === "user" && next?.tag === "assistant") {
      matches.push(next.text);
      index++;
    }
  }

  if (matches.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} summaries, received ${matches.length} user/assistant pairs.`,
    );
  }

  return matches;
}

function extractSummaryXml(responseText: string): string {
  const start = responseText.indexOf("<summary>");
  const end = responseText.lastIndexOf("</summary>");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "Summary response did not include a complete <summary> block.",
    );
  }
  return responseText.slice(start, end + "</summary>".length);
}

async function injectSummaries(
  v2: V2Client,
  sessionID: string,
  compactionTurns: Turn[],
  summaries: string[],
): Promise<void> {
  for (const [index, turn] of compactionTurns.entries()) {
    const summary = summaries[index];
    if (summary === undefined) {
      throw new Error("Missing summary for assistant turn.");
    }

    const firstAssistant = turn.assistants[0];
    if (!firstAssistant) {
      throw new Error("Turn missing assistant message.");
    }

    const part = {
      id: summaryPartID(firstAssistant.info.id),
      sessionID,
      messageID: firstAssistant.info.id,
      type: "text",
      text: summary,
      metadata: summaryMetadata(),
    } satisfies TextPart;

    unwrap(
      await v2.part.update({
        sessionID,
        messageID: firstAssistant.info.id,
        partID: part.id,
        part,
      }),
    );
  }
}
