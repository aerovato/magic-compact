import { describe, expect, test } from "bun:test";
import type { Message, Part, Session, TextPart } from "@opencode-ai/sdk/v2";
import type { V2Client } from "../src/api";
import { compactSession } from "../src/compact/compact";
import type { MessageWithParts } from "../src/compact/plan";

describe("magic compact", () => {
  test("prompts the native compaction agent with the Magic Compact XML and cleans up", async () => {
    const promptRequests: unknown[] = [];
    const deletedSessionIDs: string[] = [];
    const messages = compactableMessages();
    const v2 = {
      session: {
        messages: async () => ({ data: messages }),
        fork: async () => ({ data: session("ephemeral") }),
        update: async () => ({ data: session("ephemeral") }),
        prompt: async (request: unknown) => {
          promptRequests.push(request);
          return {
            data: {
              parts: [
                textPart(
                  "response",
                  "ephemeral",
                  "response",
                  "<summary><user>Summarize this turn\n...</user><assistant>Completed the requested work.</assistant></summary>",
                ),
              ],
            },
          };
        },
        delete: async ({ sessionID }: { sessionID: string }) => {
          deletedSessionIDs.push(sessionID);
          return { data: true };
        },
      },
      part: {
        update: async ({ part }: { part: TextPart }) => ({ data: part }),
      },
    } as unknown as V2Client;

    await compactSession(v2, session("source"), "source", 0);

    expect(promptRequests).toHaveLength(1);
    expect(promptRequests[0]).toEqual({
      sessionID: "ephemeral",
      agent: "compaction",
      parts: [
        {
          type: "text",
          text: expect.stringMatching(
            /<system>[\s\S]*Summarize this turn[\s\S]*<\/system>/,
          ),
        },
      ],
    });
    expect(deletedSessionIDs).toEqual(["ephemeral"]);
  });

  test("propagates a missing compaction agent error after cleanup without retrying", async () => {
    const promptRequests: unknown[] = [];
    const deletedSessionIDs: string[] = [];
    const v2 = {
      session: {
        messages: async () => ({ data: compactableMessages() }),
        fork: async () => ({ data: session("ephemeral") }),
        update: async () => ({ data: session("ephemeral") }),
        prompt: async (request: unknown) => {
          promptRequests.push(request);
          return { error: 'Agent not found: "compaction".' };
        },
        delete: async ({ sessionID }: { sessionID: string }) => {
          deletedSessionIDs.push(sessionID);
          return { data: true };
        },
      },
    } as unknown as V2Client;

    await expect(
      compactSession(v2, session("source"), "source", 0),
    ).rejects.toThrow('Agent not found: "compaction".');

    expect(promptRequests).toHaveLength(1);
    expect(deletedSessionIDs).toEqual(["ephemeral"]);
  });
});

function compactableMessages(): MessageWithParts[] {
  return [
    message("user", "user", [
      textPart("user-text", "source", "user", "Summarize this turn"),
    ]),
    message("assistant", "assistant", []),
  ];
}

function message(
  id: string,
  role: "user" | "assistant",
  parts: Part[],
): MessageWithParts {
  return {
    info: { id, role } as Message,
    parts,
  };
}

function session(id: string): Session {
  return { id, title: "Test session" } as Session;
}

function textPart(
  id: string,
  sessionID: string,
  messageID: string,
  text: string,
): TextPart {
  return {
    id,
    sessionID,
    messageID,
    type: "text",
    text,
  };
}
