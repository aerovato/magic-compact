import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type UserPromptSubmitHookInput = {
  session_id: string;
  transcript_path: string;
  hook_event_name: "UserPromptSubmit";
  prompt: string;
};

const commandPattern = /^\/magic-compact(?::magic-compact)?(?:\s+(\d+))?\s*$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseHookInput(rawInput: string): UserPromptSubmitHookInput {
  const input: unknown = JSON.parse(rawInput);
  if (!isRecord(input)) {
    throw new Error("Hook input must be a JSON object.");
  }

  if (
    typeof input.session_id !== "string"
    || typeof input.transcript_path !== "string"
    || input.hook_event_name !== "UserPromptSubmit"
    || typeof input.prompt !== "string"
  ) {
    throw new Error("Hook input is missing required UserPromptSubmit fields.");
  }

  return {
    session_id: input.session_id,
    transcript_path: input.transcript_path,
    hook_event_name: input.hook_event_name,
    prompt: input.prompt,
  };
}

export function parseMagicCompactCommand(prompt: string): number | null {
  const match = prompt.match(commandPattern);
  if (!match) {
    if (prompt.trim().startsWith("/magic-compact")) {
      throw new Error("Usage: /magic-compact [N: positive integer]");
    }
    return null;
  }

  return match[1] === undefined ? 0 : Number(match[1]);
}

export async function generateNewTranscript(
  input: UserPromptSubmitHookInput,
): Promise<string> {
  validateSourceTranscript(input);

  for (let attempt = 0; attempt < 5; attempt++) {
    const sessionId = randomUUID();
    const transcriptPath = join(
      dirname(input.transcript_path),
      `${sessionId}.jsonl`,
    );
    try {
      await copyFile(
        input.transcript_path,
        transcriptPath,
        constants.COPYFILE_EXCL,
      );
      return sessionId;
    } catch (error) {
      if (isFileExistsError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to create a unique destination session.");
}

function validateSourceTranscript(input: UserPromptSubmitHookInput): void {
  if (!uuidPattern.test(input.session_id)) {
    throw new Error("Hook input session_id is not a valid UUID.");
  }

  if (basename(input.transcript_path) !== `${input.session_id}.jsonl`) {
    throw new Error("Hook transcript_path does not match session_id.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFileExistsError(error: unknown): boolean {
  return isRecord(error) && error["code"] === "EEXIST";
}
