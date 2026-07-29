import { unwrap, type V2Client } from "./api";
import { STATS_METADATA, statsSummaryMessage } from "./stats/constants";
import { readStats } from "./storage/stats";
import { getCompactionCount } from "./compact/session";

export const STATS_SUCCESS = "Magic stats displayed.";

export async function executeMagicStats(
  v2: V2Client,
  sessionID: string,
): Promise<void> {
  const session = unwrap(await v2.session.get({ sessionID }));
  const stats = await readStats(sessionID);
  const compactionCount = getCompactionCount(session);
  const text = stats
    ? statsSummaryMessage(compactionCount, stats, session.model?.id ?? null)
    : "No Magic Compact stats recorded for this session. Did you run /magic-compact or /magic-trim yet?";

  unwrap(
    await v2.session.prompt({
      sessionID,
      noReply: true,
      parts: [
        {
          type: "text",
          text,
          ignored: true,
          metadata: STATS_METADATA,
        },
      ],
    }),
  );
}
