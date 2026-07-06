import {
  allocateOmission,
  inputOmissionNotice,
  outputOmissionNotice,
} from "./omission";
import { isRecord, type JsonRecord, type TranscriptRow } from "./transcript";

type OmissionCache = Parameters<typeof allocateOmission>[0];

type ToolContext = {
  cache: OmissionCache;
  sessionId: string;
  completedToolUseIds: Set<string>;
  toolNamesById: Map<string, string>;
};

const DEFAULT_LIMIT = { words: 128, chars: 1024 };
const AGENT_OUTPUT_LIMIT = { words: 512, chars: 4096 };
const DEFAULT_OUTPUT_DESCRIPTION =
  "Output omitted due to a compaction operation.";

export function pruneTranscriptRow(
  row: TranscriptRow,
  context: ToolContext,
): void {
  if (!isRecord(row.message)) {
    return;
  }

  const content = row.message["content"];
  if (!Array.isArray(content)) {
    return;
  }

  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }

    if (block["type"] === "tool_use") {
      pruneToolInput(block, context);
    }

    if (block["type"] === "tool_result") {
      pruneToolOutput(block, context);
    }
  }
}

function pruneToolInput(block: JsonRecord, context: ToolContext): void {
  const toolName = typeof block["name"] === "string" ? block["name"] : null;
  const toolUseId = typeof block["id"] === "string" ? block["id"] : null;
  if (!toolName || !toolUseId) {
    return;
  }

  context.toolNamesById.set(toolUseId, toolName);
  if (!context.completedToolUseIds.has(toolUseId)) {
    return;
  }

  const input = block["input"];
  if (!isRecord(input) || toolName === "AskUserQuestion") {
    return;
  }

  if (toolName === "Bash") {
    truncateBashCommand(input, context.cache, context.sessionId);
    return;
  }

  if (toolName === "Write") {
    omitField(
      input,
      "content",
      "File write contents omitted due to a compaction operation. If necessary, reread file to see current contents.",
      context.cache,
      context.sessionId,
    );
    return;
  }

  if (toolName === "Edit") {
    omitCombinedFields(
      input,
      "old_string",
      "new_string",
      "File edit old_string and new_string omitted due to compaction operation. If necessary, reread file to see current contents.",
      context.cache,
      context.sessionId,
    );
    return;
  }

  if (toolName === "NotebookEdit") {
    omitField(
      input,
      "new_source",
      "Notebook edit source omitted due to compaction operation. If necessary, reread notebook to see current contents.",
      context.cache,
      context.sessionId,
    );
    return;
  }

  if (toolName === "Agent") {
    omitField(
      input,
      "prompt",
      "Agent prompt omitted due to compaction operation.",
      context.cache,
      context.sessionId,
    );
    return;
  }

  if (toolName === "Workflow") {
    omitField(
      input,
      "script",
      "Workflow script omitted due to compaction operation.",
      context.cache,
      context.sessionId,
    );
    return;
  }

  if (toolName === "SendMessage") {
    omitField(
      input,
      "message",
      "Inter-agent message omitted due to compaction operation.",
      context.cache,
      context.sessionId,
    );
    return;
  }

  if (toolName === "ReportFindings") {
    omitField(
      input,
      "findings",
      "Report findings omitted due to compaction operation.",
      context.cache,
      context.sessionId,
    );
  }
}

function pruneToolOutput(block: JsonRecord, context: ToolContext): void {
  if (block["is_error"] === true) {
    return;
  }

  const toolUseId =
    typeof block["tool_use_id"] === "string" ? block["tool_use_id"] : null;
  const toolName = toolUseId ? context.toolNamesById.get(toolUseId) : null;
  if (!toolName || toolName === "AskUserQuestion") {
    return;
  }

  if (toolName === "Skill") {
    block["content"] =
      "Skill output omitted due to compaction operation. If necessary, recall the skill.";
    return;
  }

  const content = stringifyContent(block["content"]);
  if (!content) {
    return;
  }

  if (toolName === "Read") {
    const contentId = allocateOmission(
      context.cache,
      context.sessionId,
      content,
    );
    block["content"] = outputOmissionNotice(
      "Stale read contents omitted due to compaction operation. If necessary, reread to see current contents.",
      content.length,
      contentId,
    );
    return;
  }

  if (toolName === "NotebookEdit") {
    const contentId = allocateOmission(
      context.cache,
      context.sessionId,
      content,
    );
    block["content"] = outputOmissionNotice(
      "Notebook edit output omitted due to compaction operation. If necessary, reread notebook to see current contents.",
      content.length,
      contentId,
    );
    return;
  }

  const limit =
    toolName === "Agent" || toolName === "TaskOutput"
      ? AGENT_OUTPUT_LIMIT
      : DEFAULT_LIMIT;
  if (!exceeds(content, limit)) {
    return;
  }

  const contentId = allocateOmission(context.cache, context.sessionId, content);
  block["content"] = outputOmissionNotice(
    DEFAULT_OUTPUT_DESCRIPTION,
    content.length,
    contentId,
  );
}

function omitField(
  input: JsonRecord,
  field: string,
  description: string,
  cache: OmissionCache,
  sessionId: string,
): void {
  const content = stringifyContent(input[field]);
  if (!content || !exceeds(content, DEFAULT_LIMIT)) {
    return;
  }

  const contentId = allocateOmission(cache, sessionId, content);
  input[field] = "[Omitted]";
  input[`${field}_omission_notice`] = inputOmissionNotice(
    description,
    content.length,
    contentId,
  );
}

function omitCombinedFields(
  input: JsonRecord,
  firstField: string,
  secondField: string,
  description: string,
  cache: OmissionCache,
  sessionId: string,
): void {
  const first = stringifyContent(input[firstField]);
  const second = stringifyContent(input[secondField]);
  const combined = `${first}\n${second}`;
  if (!exceeds(combined, DEFAULT_LIMIT)) {
    return;
  }

  const contentId = allocateOmission(cache, sessionId, combined);
  input[firstField] = "[Omitted]";
  input[secondField] = "[Omitted]";
  input[`${firstField}_${secondField}_omission_notice`] = inputOmissionNotice(
    description,
    combined.length,
    contentId,
  );
}

function truncateBashCommand(
  input: JsonRecord,
  cache: OmissionCache,
  sessionId: string,
): void {
  const command = stringifyContent(input["command"]);
  if (command.length <= 1024) {
    return;
  }

  const contentId = allocateOmission(cache, sessionId, command);
  input["command"] = `${command.slice(0, 512)}\n[REST OF COMMAND TRUNCATED]`;
  input["command_omission_notice"] = inputOmissionNotice(
    "Bash command truncated due to compaction operation.",
    command.length,
    contentId,
  );
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (content === undefined || content === null) {
    return "";
  }

  return JSON.stringify(content);
}

function exceeds(
  text: string,
  limit: { words: number; chars: number },
): boolean {
  return wordCount(text) > limit.words || text.length > limit.chars;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
