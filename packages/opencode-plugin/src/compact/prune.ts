import type { Part, ToolPart } from "@opencode-ai/sdk/v2";
import { unwrap, type V2Client } from "../api";
import { inputOmissionNotice, outputOmissionNotice } from "./constants";
import type { MessageWithParts, Turn } from "./plan";
import { allocateOmission } from "../storage/omission";
import { isRecord, unwrapString } from "../util";

type PruneContext = {
  v2: V2Client;
  sessionID: string;
};

const DEFAULT_OUTPUT_DESCRIPTION =
  "Output omitted due to a compaction operation.";

const DEFAULT_LIMIT = { words: 128, chars: 1024 };
const TASK_OUTPUT_LIMIT = { words: 512, chars: 4096 };
// webfetch frequently returns large HTML/markdown pages — always omit with cache
const WEBFETCH_LIMIT = { words: 64, chars: 512 };
// glob/grep outputs are file lists / search results — compact aggressively
const SEARCH_LIMIT = { words: 64, chars: 512 };

export async function pruneSummarizedTurns(
  context: PruneContext,
  turns: Turn[],
): Promise<void> {
  for (const turn of turns) {
    for (const user of turn.user) {
      await pruneUserParts(context, user);
    }

    for (const assistant of turn.assistants) {
      await pruneAssistantParts(context, assistant);
    }
  }
}

async function pruneUserParts(
  context: PruneContext,
  message: MessageWithParts,
): Promise<void> {
  for (const part of message.parts) {
    if (part.type !== "text" || part.synthetic !== true) {
      // If not text (attachment) or is text but not synthetic, don't prune
      continue;
    }

    if (isImportantSyntheticPart(part)) {
      // If is an important synthetic part, don't prune
      continue;
    }

    // Prune useless synthetic part
    unwrap(
      await context.v2.part.delete({
        sessionID: context.sessionID,
        messageID: message.info.id,
        partID: part.id,
      }),
    );
  }
}

async function pruneAssistantParts(
  context: PruneContext,
  message: MessageWithParts,
): Promise<void> {
  let keptParts = 0;

  for (const part of message.parts) {
    // If is compaction summary, leave alone
    if (isSummaryPart(part)) {
      keptParts += 1;
      continue;
    }

    // If it is a tool call, prune but keep
    if (part.type === "tool") {
      await pruneToolPart(context, part);
      keptParts += 1;
      continue;
    }

    // Otherwise, delete part (reasoning / text)
    unwrap(
      await context.v2.part.delete({
        sessionID: context.sessionID,
        messageID: message.info.id,
        partID: part.id,
      }),
    );
  }

  if (keptParts === 0) {
    unwrap(
      await context.v2.session.deleteMessage({
        sessionID: context.sessionID,
        messageID: message.info.id,
      }),
    );
  }
}

async function pruneToolPart(
  context: PruneContext,
  part: ToolPart,
): Promise<void> {
  if (part.state.status !== "completed") {
    return;
  }

  const inputNotice = await applyInputOmissions(context, part);
  await applyOutputOmissions(context, part);

  if (inputNotice) {
    part.state.output = `${inputNotice}\n\n${part.state.output}`;
  }

  unwrap(
    await context.v2.part.update({
      sessionID: context.sessionID,
      messageID: part.messageID,
      partID: part.id,
      part: {
        ...part,
        sessionID: context.sessionID,
      },
    }),
  );
}

async function applyInputOmissions(
  context: PruneContext,
  part: ToolPart,
): Promise<string | null> {
  if (part.state.status !== "completed") {
    return null;
  }

  const input = part.state.input;

  if (part.tool === "write") {
    const content = unwrapString(input["content"]);
    if (content && exceeds(content, DEFAULT_LIMIT)) {
      const contentID = await allocateOmission(context.sessionID, { content });
      input["content"] = "[Omitted]";
      return inputOmissionNotice(
        "File write contents omitted due to a compaction operation. If necessary, reread file to see current contents.",
        content.length,
        contentID,
      );
    }
  }

  if (part.tool === "apply_patch") {
    const content = unwrapString(input["patchText"]);
    if (content && exceeds(content, DEFAULT_LIMIT)) {
      const contentID = await allocateOmission(context.sessionID, { content });
      input["patchText"] = "[Omitted]";
      return inputOmissionNotice(
        "Patch text omitted due to compaction operation. If necessary, reread files to see current contents.",
        content.length,
        contentID,
      );
    }
  }

  if (part.tool === "bash") {
    const content = unwrapString(input["command"]);
    if (content && content.length > 1024) {
      const contentID = await allocateOmission(context.sessionID, { content });
      input["command"] =
        `${content.slice(0, 512)}\n[REST OF COMMAND TRUNCATED]`;
      return inputOmissionNotice(
        "Bash command truncated due to compaction operation.",
        content.length,
        contentID,
      );
    }
  }

  if (part.tool === "edit") {
    const oldString = unwrapString(input["oldString"]);
    const newString = unwrapString(input["newString"]);
    const combined = `${oldString}\n${newString}`;
    if (exceeds(combined, DEFAULT_LIMIT)) {
      const contentID = await allocateOmission(context.sessionID, {
        content: combined,
      });
      input["oldString"] = "[Omitted]";
      input["newString"] = "[Omitted]";
      return inputOmissionNotice(
        "File edit oldString and newString omitted due to compaction operation. If necessary, reread file to see current contents.",
        combined.length,
        contentID,
      );
    }
  }

  return null;
}

async function applyOutputOmissions(
  context: PruneContext,
  part: ToolPart,
): Promise<void> {
  if (part.state.status !== "completed") {
    return;
  }

  const output = part.state.output;

  if (part.tool === "question") {
    return;
  }

  if (part.tool === "todowrite") {
    part.state.output = "Successfully updated todos.";
    return;
  }

  if (part.tool === "skill") {
    part.state.output =
      "Skill contents omitted due to compaction operation. If necessary, recall skill.";
    return;
  }

  if (part.tool === "read") {
    const contentID = await allocateOmission(context.sessionID, {
      content: output,
    });
    part.state.output = outputOmissionNotice(
      "Stale read contents omitted due to compaction operation. If necessary, reread to see current contents.",
      output.length,
      contentID,
    );
    return;
  }

  if (part.tool === "task") {
    if (exceeds(output, TASK_OUTPUT_LIMIT)) {
      const contentID = await allocateOmission(context.sessionID, {
        content: output,
      });
      part.state.output = outputOmissionNotice(
        "Task output omitted due to a compaction operation. If necessary, reread output via read_omitted_content tool.",
        output.length,
        contentID,
      );
    }
    return;
  }

  // webfetch: HTML/markdown pages are large and stale — always omit above threshold.
  // The URL is preserved in the tool input so the agent can re-fetch if needed.
  if (part.tool === "webfetch" || part.tool === "mcp_Webfetch") {
    if (exceeds(output, WEBFETCH_LIMIT)) {
      const contentID = await allocateOmission(context.sessionID, {
        content: output,
      });
      part.state.output = outputOmissionNotice(
        "Web page contents omitted due to compaction operation. Re-fetch the URL from tool input if current contents are needed.",
        output.length,
        contentID,
      );
    }
    return;
  }

  // glob: file listing results are reproducible — omit above threshold.
  if (part.tool === "glob" || part.tool === "mcp_Glob") {
    if (exceeds(output, SEARCH_LIMIT)) {
      const contentID = await allocateOmission(context.sessionID, {
        content: output,
      });
      part.state.output = outputOmissionNotice(
        "Glob file listing omitted due to compaction operation. Re-run glob with the same pattern to reproduce.",
        output.length,
        contentID,
      );
    }
    return;
  }

  // grep: search results are reproducible — omit above threshold.
  if (part.tool === "grep" || part.tool === "mcp_Grep") {
    if (exceeds(output, SEARCH_LIMIT)) {
      const contentID = await allocateOmission(context.sessionID, {
        content: output,
      });
      part.state.output = outputOmissionNotice(
        "Grep search results omitted due to compaction operation. Re-run grep with the same pattern to reproduce.",
        output.length,
        contentID,
      );
    }
    return;
  }

  if (!exceeds(output, DEFAULT_LIMIT)) {
    return;
  }

  const contentID = await allocateOmission(context.sessionID, {
    content: output,
  });
  part.state.output = outputOmissionNotice(
    DEFAULT_OUTPUT_DESCRIPTION,
    output.length,
    contentID,
  );
}

function isSummaryPart(part: Part): boolean {
  if (part.type !== "text") {
    return false;
  }

  const metadata = part.metadata;
  if (!isRecord(metadata)) {
    return false;
  }

  const magicCompact = metadata["magicCompact"];
  return isRecord(magicCompact) && magicCompact["summary"] === true;
}

function isImportantSyntheticPart(part: Part): boolean {
  return (
    part.type === "text"
    && part.synthetic === true
    && (part.text === "The following tool was executed by the user"
      || part.text.startsWith("<task ")
      || part.text.includes(
        "The user has changed the current working directory to",
      )
      || part.text.startsWith("The user made the following comment"))
  );
}

function exceeds(
  text: string,
  limit: { words: number; chars: number },
): boolean {
  return wordCount(text) > limit.words || text.length > limit.chars;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}
