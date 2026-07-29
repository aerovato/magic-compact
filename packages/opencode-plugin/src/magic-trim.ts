import type { Session } from "@opencode-ai/sdk/v2";
import { unwrap, type V2Client } from "./api";
import { createTrimPlan } from "./compact/plan";
import { trimToolParts } from "./compact/prune";
import {
  applyBackup,
  createBackup,
  getCompactionCount,
  injectTrimStatsNotice,
  recordPruningStats,
} from "./compact/session";
import { countSessionTokens } from "./stats/tokenize";

export const TRIM_SUCCESS = "Magic trimming successful.";
export const TRIM_NOOP = "No eligible tool calls need trimming.";

export async function executeMagicTrim(
  v2: V2Client,
  sessionID: string,
  keepTurns: number,
): Promise<boolean> {
  let backupSession: Session | null = null;
  let sourceSession: Session | null = null;

  try {
    const plan = await createTrimPlan(v2, sessionID, keepTurns);
    sourceSession = unwrap(await v2.session.get({ sessionID }));
    backupSession = await createBackup(
      v2,
      sourceSession,
      getCompactionCount(sourceSession),
    );

    const beforeTokens = await countSessionTokens(v2, sessionID);
    const trimmedToolCalls = await trimToolParts(
      { v2, sessionID },
      plan.trimmedTurns,
    );
    if (trimmedToolCalls === 0) {
      await v2.tui.showToast({
        title: "Magic Trim",
        message: TRIM_NOOP,
        variant: "info",
        duration: 5000,
      });
      return false;
    }

    const afterTokens = await countSessionTokens(v2, sessionID);
    const stats = await recordPruningStats({
      sessionID,
      sourceSessionID: sessionID,
      tokensPruned: beforeTokens - afterTokens,
    });

    await injectTrimStatsNotice(
      v2,
      sessionID,
      beforeTokens,
      afterTokens,
      stats,
      sourceSession.model?.id ?? null,
    );

    await v2.tui.showToast({
      title: "Magic Trim",
      message: `Trimmed ${trimmedToolCalls} tool call(s).`,
      variant: "info",
      duration: 5000,
    });
    return true;
  } catch (error) {
    if (sourceSession && backupSession) {
      await applyBackup(v2, sourceSession, backupSession);
    }

    await v2.tui.showToast({
      title: "Magic Trim Failed",
      message: String(error),
      variant: "error",
      duration: 8000,
    });
    throw error;
  }
}
