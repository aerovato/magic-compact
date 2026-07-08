import type { TextPart } from "@opencode-ai/sdk/v2";
import { type Turn } from "./plan";

export function buildCompactionPrompt(
  turns: Turn[],
  nextTurn: Turn | null,
): string {
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
[**Do not add an <assistant> summary for the final <user> above; it marks where summarization stops and the template ends here.**]
`.trim(),
    );
  }
  parts.push("</summary>");
  return parts.join("\n");
}

function getUserPromptText(turn: Turn): string {
  const userText = turn.user
    .flatMap(msg => msg.parts)
    .filter(
      (part): part is TextPart =>
        part.type === "text"
        && part.synthetic !== true
        && part.ignored !== true,
    )
    .map(part => part.text)
    .join("\n");
  return truncateUserText(userText);
}

function truncateUserText(text: string): string {
  const firstLine = text.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= 300) {
    return `${firstLine}\n...`;
  }
  return `${firstLine.slice(0, 300).trim()}...`;
}
