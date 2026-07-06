import {
  generateNewTranscript,
  parseHookInput,
  parseMagicCompactCommand,
} from "./util";

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

    const newSessionId = await generateNewTranscript(input);

    writeHookOutput({
      continue: false,
      stopReason: [
        "Magic Compact success.",
        "To enter the compacted session, run the following command:",
        `/resume ${newSessionId}`,
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
