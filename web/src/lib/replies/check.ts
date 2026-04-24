import { prisma } from "@/lib/db";
import { getUsableAccessToken } from "@/lib/providers/tokens";
import { logger } from "@/lib/logger";
import { fetchGmailThread, summarizeReplies } from "./gmail-threads";

export type CheckRepliesScope =
  | { kind: "user"; userId: string }
  | { kind: "campaign"; campaignId: string; userId: string };

export type CheckRepliesResult = {
  checked: number;
  newReplies: number;
  failed: number;
};

const RECHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 min — don't hammer Gmail

/**
 * Poll Gmail threads for sent recipients in-scope and update reply fields.
 *
 * - Batches per ProviderAccount so we only decrypt/refresh one token per inbox.
 * - Skips rows checked within RECHECK_INTERVAL_MS unless `force` is true.
 * - Silent on a single thread failure (Gmail hiccups) but surfaces totals.
 */
export async function checkReplies(
  scope: CheckRepliesScope,
  opts: { force?: boolean } = {},
): Promise<CheckRepliesResult> {
  const force = opts.force ?? false;

  const campaignFilter =
    scope.kind === "campaign"
      ? { id: scope.campaignId, userId: scope.userId }
      : { userId: scope.userId };

  const recipients = await prisma.recipientDraft.findMany({
    where: {
      providerThreadId: { not: null },
      status: "sent",
      campaign: campaignFilter,
      ...(force
        ? {}
        : {
            OR: [
              { lastCheckedAt: null },
              { lastCheckedAt: { lt: new Date(Date.now() - RECHECK_INTERVAL_MS) } },
            ],
          }),
    },
    include: {
      campaign: {
        select: { sendingProviderAccountId: true, userId: true },
      },
    },
  });

  if (recipients.length === 0) {
    return { checked: 0, newReplies: 0, failed: 0 };
  }

  // Group by providerAccount so we fetch one access token per inbox.
  const byProviderAccount = new Map<string, typeof recipients>();
  for (const r of recipients) {
    const paId = r.campaign.sendingProviderAccountId;
    if (!paId) continue;
    const list = byProviderAccount.get(paId) ?? [];
    list.push(r);
    byProviderAccount.set(paId, list);
  }

  let checked = 0;
  let newReplies = 0;
  let failed = 0;

  for (const [providerAccountId, rows] of Array.from(byProviderAccount.entries())) {
    let accessToken: string;
    try {
      ({ accessToken } = await getUsableAccessToken(
        providerAccountId,
        rows[0].campaign.userId,
      ));
    } catch (e) {
      logger.warn("replies.token_failed", {
        providerAccountId,
        error: (e as Error).message,
      });
      failed += rows.length;
      continue;
    }

    for (const r of rows) {
      try {
        const thread = await fetchGmailThread(accessToken, r.providerThreadId!);
        const now = new Date();
        if (!thread) {
          await prisma.recipientDraft.update({
            where: { id: r.id },
            data: { lastCheckedAt: now },
          });
          checked++;
          continue;
        }
        const summary = summarizeReplies(thread);
        const hadReply = r.replyCount > 0;
        const hasNewReply = summary.replyCount > r.replyCount;

        await prisma.recipientDraft.update({
          where: { id: r.id },
          data: {
            lastCheckedAt: now,
            replyCount: summary.replyCount,
            lastReplyAt: summary.lastReplyAt,
            lastReplyFrom: summary.lastReplyFrom,
            lastReplySnippet: summary.lastReplySnippet,
            // Only set repliedAt the first time we see a reply.
            repliedAt: r.repliedAt ?? summary.firstReplyAt,
          },
        });

        if (!hadReply && summary.replyCount > 0) newReplies++;
        else if (hasNewReply) newReplies++;
        checked++;
      } catch (e) {
        failed++;
        logger.warn("replies.thread_failed", {
          recipientId: r.id,
          threadId: r.providerThreadId,
          error: (e as Error).message,
        });
      }
    }
  }

  return { checked, newReplies, failed };
}
