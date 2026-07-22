import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression guard for the bug where the compaction stats notice compared
// beforeTokens (getProviderTokens: real provider usage, same field OpenCode's
// own sidebar "used Xk" indicator reads) against afterTokens
// (countSessionTokens: a local text re-estimate). The two numbers came from
// unrelated data sources, so "before -> after (% reduced)" had no reliable
// relationship to what the user actually saw in OpenCode's context indicator
// afterward.
//
// Fix: both beforeTokens and afterTokens must be computed with
// countSessionTokens, so the printed reduction is at least internally
// consistent. This test fails loudly (source-level guard) if
// getProviderTokens is reintroduced into magic-compact.ts's before/after
// comparison, without needing a full mocked v2 client / integration harness.
describe("magic-compact.ts before/after token metric consistency", () => {
  it("does not import getProviderTokens (a comment may still explain why, for documentation)", () => {
    const path = fileURLToPath(new URL("./magic-compact.ts", import.meta.url));
    const source = readFileSync(path, "utf8");
    const importLine = source
      .split("\n")
      .find(line => line.includes('from "./stats/tokenize"'));

    expect(importLine).toBeDefined();
    expect(importLine).not.toContain("getProviderTokens");
    expect(importLine).toContain("countSessionTokens");
  });

  it("computes beforeTokens and afterTokens with the exact same call shape", () => {
    const path = fileURLToPath(new URL("./magic-compact.ts", import.meta.url));
    const source = readFileSync(path, "utf8");

    const beforeCall =
      /const beforeTokens = await countSessionTokens\(v2, sessionID\);/;
    const afterCall =
      /const afterTokens = await countSessionTokens\(v2, sessionID\);/;

    expect(source).toMatch(beforeCall);
    expect(source).toMatch(afterCall);
  });
});
