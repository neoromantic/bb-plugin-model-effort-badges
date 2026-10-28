import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { runResult } from "./attention";

const SELECT = "SELECT thread_id AS threadId, result_at AS resultAt, quiet_attention_at AS quietAttentionAt, seen_at AS seenAt FROM attention";

const attention = z.object({
  threadId: z.string(),
  resultAt: z.number().nullable(),
  quietAttentionAt: z.number().nullable(),
  seenAt: z.number().nullable(),
});

export default function plugin(bb: BbPluginApi) {
  bb.settings.define({
    placement: {
      type: "select",
      label: "Badge placement",
      description:
        "Tile replaces the Codex and Claude logos with a colored model and effort tile; other providers keep the caption under their logo. Under the logo keeps the full title width; beside the logo is larger and takes about three title characters.",
      options: ["tile", "under", "beside"],
      experimental_optionLabels: { tile: "Tile instead of the logo", under: "Under the logo", beside: "Beside the logo" },
      default: "tile",
    },
    columns: {
      type: "select",
      label: "Subthread columns",
      description:
        "Auto shows a thread whose subthreads wait for your answer, failed or hold an unread result as columns: the thread, then each such subthread. Working subthreads get none. Off keeps the plain thread view.",
      options: ["auto", "off"],
      experimental_optionLabels: { auto: "Open automatically", off: "Off" },
      default: "auto",
    },
    maxColumns: {
      type: "number",
      label: "Subthread columns limit",
      description:
        "The most subthread columns a page shows, besides the thread itself. When more need you, those waiting for your answer come first, then failed ones, then unread results, newest first; the rest show as +N more.",
      default: 8,
      experimental_schema: z.number().int().min(1),
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, [
    "CREATE TABLE attention (thread_id TEXT PRIMARY KEY, result_at INTEGER, quiet_attention_at INTEGER, seen_at INTEGER)",
  ]);
  const publish = (threadId: string) => bb.realtime.publish("attention", db.prepare(`${SELECT} WHERE thread_id = ?`).get(threadId));

  // Reads only the run that just ended: newest first, page by page, until its own request.
  bb.events.on("thread.idle", async ({ thread }) => {
    let at: number | null | undefined;
    let beforeSeq: string | undefined;
    do {
      const page = await bb.sdk.threads.events.list({
        threadId: thread.id,
        types: ["client/turn/requested", "item/completed", "system/manager/user_message"],
        order: "desc",
        limit: "100",
        beforeSeq,
      });
      at = runResult(page, thread.updatedAt);
      if (page.length < 100) at ??= null;
      beforeSeq = page.at(-1)?.seq.toString();
    } while (at === undefined);
    // Reads can finish out of order; a stored value never moves back.
    if (at !== null) {
      db.prepare("INSERT INTO attention (thread_id, result_at) VALUES (?, ?) ON CONFLICT DO UPDATE SET result_at = max(coalesce(result_at, 0), excluded.result_at)").run(thread.id, at);
    } else if (thread.parentThreadId === null) {
      // BB marked this root unread for a run that wrote nothing.
      db.prepare("INSERT INTO attention (thread_id, quiet_attention_at) VALUES (?, ?) ON CONFLICT DO UPDATE SET quiet_attention_at = max(coalesce(quiet_attention_at, 0), excluded.quiet_attention_at)").run(thread.id, thread.latestAttentionAt);
    } else return;
    publish(thread.id);
  });

  bb.rpc.register(
    {
      list: { input: z.object({}), output: z.array(attention) },
      seen: { input: z.object({ threadId: z.string(), resultAt: z.number() }), output: z.null() },
    },
    {
      list: () => db.prepare(SELECT).all() as z.infer<typeof attention>[],
      seen: ({ threadId, resultAt }) => {
        // A failed thread may have no row yet: its seen mark is its last update.
        db.prepare("INSERT INTO attention (thread_id, seen_at) VALUES (?, ?) ON CONFLICT DO UPDATE SET seen_at = max(coalesce(seen_at, 0), excluded.seen_at)").run(threadId, resultAt);
        publish(threadId);
        return null;
      },
    },
  );
}
