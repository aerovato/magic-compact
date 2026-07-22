import { getCachedReadPrice } from "./pricing";
import type { ConversationStats } from "../storage/stats";

export const STATS_METADATA = {
  magicCompact: {
    stats: true,
  },
};

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`.replace(".0K", "K");
  }
  return tokens.toString();
}

export function statsSummaryMessage(
  compactionCount: number,
  stats: ConversationStats,
  modelID: string | null,
): string {
  const moneySaved = moneySavedMessage(stats, modelID);

  return `
Magic Compact      | ${compactionCount} compactions performed
Conversation Stats | Total tokens pruned: ~${formatTokenCount(stats.totalTokensPruned)} | Total cache reads saved: ~${formatTokenCount(stats.cachedTokensSaved)} tokens
Cost Savings       | ${moneySaved}
`.trim();
}

export function statsMessage(
  compactionCount: number,
  beforeTokens: number,
  afterTokens: number,
  stats: ConversationStats,
  modelID: string | null,
): string {
  const savedTokens = beforeTokens - afterTokens;
  const percent =
    beforeTokens > 0 ? Math.round((savedTokens / beforeTokens) * 100) : 0;
  const moneySaved = moneySavedMessage(stats, modelID);

  return `
Magic Compaction #${compactionCount}
Compaction Stats   | ${formatTokenCount(beforeTokens)} → ${formatTokenCount(afterTokens)} tokens (${percent}% reduced) | ~${formatTokenCount(savedTokens)} tokens pruned
Conversation Stats | Total tokens pruned: ~${formatTokenCount(stats.totalTokensPruned)} | Total cache reads saved: ~${formatTokenCount(stats.cachedTokensSaved)} tokens
Cost Savings       | ${moneySaved}
Note: this is an estimate of the reduced conversation; OpenCode's context/"used" indicator updates on your next message, not immediately.
`.trim();
}

function moneySavedMessage(
  stats: ConversationStats,
  modelID: string | null,
): string {
  const dollarsPerMillion =
    modelID !== null ? getCachedReadPrice(modelID) : null;
  if (dollarsPerMillion === null) {
    return `Cost savings unavailable: Model not supported: ${modelID}`;
  }

  return `Est. cost saved (${modelID}): $${((stats.cachedTokensSaved / 1_000_000) * dollarsPerMillion).toFixed(4)}`;
}
