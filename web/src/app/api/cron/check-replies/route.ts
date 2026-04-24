import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { checkReplies } from "@/lib/replies/check";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/check-replies
 *
 * Invoked by Vercel Cron on a schedule (see `web/vercel.json`).
 *
 * Walks every user who has at least one recipient with `providerThreadId`
 * in a `sent` state and polls Gmail for new replies. Silently skips users
 * whose token refresh fails (e.g. revoked grant) — the next run will try
 * again, and the per-row `lastCheckedAt` acts as a natural throttle.
 *
 * Auth: if CRON_SECRET is set, require `Authorization: Bearer <token>`.
 * Vercel Cron automatically sends this header when the env var exists on
 * the project (see https://vercel.com/docs/cron-jobs/manage-cron-jobs).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (env.CRON_SECRET) {
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (req.headers.get("authorization") !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const userRows = await prisma.recipientDraft.findMany({
    where: {
      providerThreadId: { not: null },
      status: "sent",
    },
    select: { campaign: { select: { userId: true } } },
    distinct: ["campaignId"],
  });

  const userIds = Array.from(new Set(userRows.map((r) => r.campaign.userId)));

  let totalChecked = 0;
  let totalNew = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    try {
      const r = await checkReplies({ kind: "user", userId });
      totalChecked += r.checked;
      totalNew += r.newReplies;
      totalFailed += r.failed;
    } catch (e) {
      logger.warn("cron.check_replies.user_failed", {
        userId,
        error: (e as Error).message,
      });
      totalFailed++;
    }
  }

  logger.info("cron.check_replies.done", {
    users: userIds.length,
    checked: totalChecked,
    newReplies: totalNew,
    failed: totalFailed,
  });

  return NextResponse.json({
    ok: true,
    users: userIds.length,
    checked: totalChecked,
    newReplies: totalNew,
    failed: totalFailed,
  });
}
