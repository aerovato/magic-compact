export type UserPromptSubmitHookInput = {
  session_id: string;
  transcript_path: string;
  hook_event_name: "UserPromptSubmit";
  prompt: string;
};

const commandPattern = /^\/magic-compact(?::magic-compact)?(?:\s+(\d+))?\s*$/;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
