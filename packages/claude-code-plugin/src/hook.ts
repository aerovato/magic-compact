import { unlink } from "node:fs/promises";
import { compactTranscript } from "./compact";
import { parseHookInput, parseMagicCompactCommand } from "./command";
import { copyTranscriptToNewSession } from "./transcript";

type HookOutput = {
  continue?: false;
  suppressOutput?: boolean;
  stopReason?: string;
};

async function main(): Promise<void> {
  try {
    const input = parseHookInput(await Bun.stdin.text());
    const keepTurns = parseMagicCompactCommand(input.prompt);
    if (keepTurns === null) {
      writeHookOutput({ suppressOutput: true });
      return;
    }

    const destination = await copyTranscriptToNewSession(input.transcript_path);
    const compacted = await compactTranscript(
      destination.transcriptPath,
      destination.sessionId,
      keepTurns,
    );
    if (!compacted) {
      await unlink(destination.transcriptPath).catch(() => undefined);
      writeHookOutput({
        continue: false,
        stopReason:
          "Magic Compact skipped: no older assistant turns to compact.",
      });
      return;
    }

    writeHookOutput({
      continue: false,
      stopReason: [
        "Magic Compact success.",
        "To enter the compacted session, run the following command:",
        `/resume ${destination.sessionId}`,
      ].join("\n"),
    });
  } catch (error) {
    writeHookOutput({
      continue: false,
      stopReason: `Magic Compact failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function writeHookOutput(output: HookOutput): void {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

await main();
