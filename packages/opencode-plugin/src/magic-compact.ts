import type { Session } from "@opencode-ai/sdk/v2";
import { unwrap, type V2Client } from "./api";
import { compactSession } from "./compact/compact";
import {
  applyBackup,
  createBackup,
  deleteProgressNotice,
  getCompactionCount,
  injectPostCompactionNotice,
  injectProgressNotice,
  injectCompactStatsNotice,
  recordPruningStats,
  reloadTurns,
  updateCompactionMetadata,
} from "./compact/session";
import { createCompactionPlan } from "./compact/plan";
import { pruneSummarizedTurns } from "./compact/prune";
import { countSessionTokens, getProviderTokens } from "./stats/tokenize";

export const COMPACT_SUCCESS = "Magic compaction successful.";
export const COMPACT_NOOP = "No assistant turns are old enough to compact.";

export async function executeMagicCompact(
  v2: V2Client,
  sessionID: string,
  keepTurns: number,
): Promise<boolean> {
  let backupSession: Session | null = null;
  let sourceSession: Session | null = null;

  try {
    // Check if there's anything to compact
    const sourcePlan = await createCompactionPlan(v2, sessionID, keepTurns);
    if (sourcePlan.summarizedTurns.length === 0) {
      await v2.tui.showToast({
        title: "Magic Compact",
        message: COMPACT_NOOP,
        variant: "info",
        duration: 5000,
      });
      return false;
    }

    // Create backup session
    sourceSession = unwrap(
      await v2.session.get({
        sessionID,
      }),
    );
    const currentCompactionCount = getCompactionCount(sourceSession) + 1;
    backupSession = await createBackup(
      v2,
      sourceSession,
      currentCompactionCount,
    );

    const beforeTokens =
      (await getProviderTokens(v2, sessionID))
      ?? (await countSessionTokens(v2, sessionID));

    const progressMessageID = await injectProgressNotice(v2, sessionID);
    let compacted;
    try {
      // Compact current session
      compacted = await compactSession(v2, sourceSession, sessionID, keepTurns);
    } finally {
      await deleteProgressNotice(v2, sessionID, progressMessageID);
    }

    // Mark the new compaction boundary for future recompactions
    // Message placed outside of summarization range so unaffected by pruning
    await injectPostCompactionNotice(v2, sessionID, compacted.nextTurn);

    // Prune messages & tool calls
    const summarizedTurns = await reloadTurns(
      v2,
      sessionID,
      compacted.summarizedTurns,
    );
    await pruneSummarizedTurns({ v2, sessionID }, summarizedTurns);

    await updateCompactionMetadata(v2, sourceSession, currentCompactionCount);
    const afterTokens = await countSessionTokens(v2, sessionID);
    const stats = await recordPruningStats({
      sessionID,
      sourceSessionID: sessionID,
      tokensPruned: beforeTokens - afterTokens,
    });

    await injectCompactStatsNotice(
      v2,
      sessionID,
      beforeTokens,
      afterTokens,
      currentCompactionCount,
      stats,
      sourceSession.model?.id ?? null,
    );

    await v2.tui.showToast({
      title: "Magic Compact",
      message: `Compacted ${compacted.summarizedTurns.length} assistant turn(s).`,
      variant: "info",
      duration: 5000,
    });
    return true;
  } catch (error) {
    if (sourceSession && backupSession) {
      await applyBackup(v2, sourceSession, backupSession);
    }

    await v2.tui.showToast({
      title: "Magic Compact Failed",
      message: String(error),
      variant: "error",
      duration: 8000,
    });
    throw error;
  }
}
