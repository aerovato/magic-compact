import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { getV2Client } from "./api";
import {
  COMPACT_NOOP,
  COMPACT_SUCCESS,
  executeMagicCompact,
} from "./magic-compact";
import { STATS_SUCCESS, executeMagicStats } from "./magic-stats";
import { readOmittedContent } from "./storage/omission";
import { handleStatsEvent } from "./stats/events";

const COMPACT_COMMAND = "magic-compact";
const STATS_COMMAND = "magic-stats";

const server: Plugin = async input => {
  return {
    config: async config => {
      config.command ??= {};
      config.command[COMPACT_COMMAND] = {
        template: "",
        description: "Lossless context compression",
      };
      config.command[STATS_COMMAND] = {
        template: "",
        description: "Show Magic Compact token and cost savings stats",
      };
    },
    "command.execute.before": async command => {
      if (command.command === STATS_COMMAND) {
        if (command.arguments.trim() !== "") {
          throw new Error("/magic-stats does not accept arguments.");
        }

        await executeMagicStats(getV2Client(input), command.sessionID);
        throw new Error(STATS_SUCCESS);
      }

      if (command.command !== COMPACT_COMMAND) {
        return;
      }

      const trimmed = command.arguments.trim();
      if (!/^\d*$/.test(trimmed)) {
        throw new Error(
          "/magic-compact argument must be a non-negative integer.",
        );
      }
      const keepTurns = trimmed ? Number(trimmed) : 0;

      const compacted = await executeMagicCompact(
        getV2Client(input),
        command.sessionID,
        keepTurns,
      );

      // Must throw error or OpenCode will send message to LLM
      throw new Error(compacted ? COMPACT_SUCCESS : COMPACT_NOOP);
    },
    event: async input => {
      await handleStatsEvent(input.event);
    },
    tool: {
      read_omitted_content: tool({
        description:
          "Read original tool input or output content omitted by context compaction operations. Note that this tool reads the snapshot of previously executed tool I/O back in time and contents should be expected to be stale. Only use this tool if you strictly require stale input or output content information from previously completed tool calls AND similar information cannot be obtained via new tool calls.",
        args: {
          contentId: tool.schema
            .string()
            .describe("Omitted content ID. E.g.: omitted-001."),
        },
        async execute(args, context) {
          const content = await readOmittedContent(
            context.sessionID,
            args.contentId,
          );
          return (
            content
            ?? `No omitted content found for Content ID: ${args.contentId}`
          );
        },
      }),
    },
  };
};

export default server;
