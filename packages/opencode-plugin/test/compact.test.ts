import { describe, expect, test } from "bun:test";
import type { Message, Part, Session, TextPart } from "@opencode-ai/sdk/v2";
import type { V2Client } from "../src/api";
import { compactSession } from "../src/compact/compact";
import type { MessageWithParts } from "../src/compact/plan";

describe("magic compact", () => {
  test("preserves the active prompt prefix and model", async () => {
    const requests = await runCompaction({
      ...session("source"),
      agent: "build",
      model: {
        providerID: "provider",
        id: "model",
        variant: "fast",
      },
      permission: [
        {
          permission: "read",
          pattern: "*",
          action: "allow",
        },
      ],
    });

    expect(requests.updates).toEqual([
      {
        sessionID: "ephemeral",
        title: "[TEMP] Test session",
        permission: [
          {
            permission: "read",
            pattern: "*",
            action: "allow",
          },
        ],
      },
    ]);
    expect(requests.prompts[0]).toMatchObject({
      sessionID: "ephemeral",
      agent: "build",
      model: {
        providerID: "provider",
        modelID: "model",
      },
      variant: "fast",
    });
  });

  test("omits unavailable prompt settings", async () => {
    const requests = await runCompaction(session("source"));

    expect(requests.updates).toEqual([
      {
        sessionID: "ephemeral",
        title: "[TEMP] Test session",
      },
    ]);
    expect(requests.prompts[0]).not.toHaveProperty("agent");
    expect(requests.prompts[0]).not.toHaveProperty("model");
    expect(requests.prompts[0]).not.toHaveProperty("variant");
  });
});

async function runCompaction(sourceSession: Session): Promise<{
  prompts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
}> {
  const prompts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const v2 = {
    session: {
      messages: async () => ({ data: compactableMessages() }),
      fork: async () => ({ data: session("ephemeral") }),
      update: async (request: Record<string, unknown>) => {
        updates.push(request);
        return { data: session("ephemeral") };
      },
      prompt: async (request: Record<string, unknown>) => {
        prompts.push(request);
        return {
          data: {
            parts: [
              textPart(
                "response",
                "ephemeral",
                "response",
                "<summary><user>Request</user><assistant>Completed the request.</assistant></summary>",
              ),
            ],
          },
        };
      },
      delete: async () => ({ data: true }),
    },
    part: {
      update: async ({ part }: { part: TextPart }) => ({ data: part }),
    },
  } as unknown as V2Client;

  await compactSession(v2, sourceSession, "source", 0);
  return { prompts, updates };
}

function compactableMessages(): MessageWithParts[] {
  return [
    message("user", "user", [
      textPart("user-text", "source", "user", "Request"),
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
