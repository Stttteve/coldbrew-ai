import { NextResponse } from "next/server";
import { z } from "zod";

import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { withAppendedSignature } from "@/lib/email/compose-signature";
import { withAppendedResumeMention } from "@/lib/email/resume-mention";
import { collectOutboundAttachments } from "@/lib/email/collect-outbound-attachments";
import { prisma } from "@/lib/db";
import {
  HttpError,
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import { getProvider } from "@/lib/providers";
import { getUsableAccessToken } from "@/lib/providers/tokens";
import { logger } from "@/lib/logger";

/**
 * POST /api/campaigns/:id/push
 * Body: { providerAccountId: string }
 *
 * Walks every DRAFTED or APPROVED recipient and calls the provider's createDraft
 * (Approve is optional — same rows as can be sent in one batch).
 * Successes are recorded with their provider draft id + deep link.
 * Failures are recorded on the row (no retry loop — user clicks again).
 *
 * Concurrency: 5. Conservative so we don't trip Gmail rate limits during a
 * big batch; the spec allows 10 — tune once real quotas are observed.
 */

const CONCURRENCY = 5;

const bodySchema = z.object({
  providerAccountId: z.string().uuid(),
});

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    const campaign = await requireOwnedCampaign(ctx.params.id, userId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "invalid_input");

    const { accessToken, providerUserEmail, provider: providerKind } =
      await getUsableAccessToken(parsed.data.providerAccountId, userId);

    const provider = getProvider(providerKind);

    const toPush = await prisma.recipientDraft.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ["drafted", "approved"] },
        email: { not: null },
        subject: { not: null },
        body: { not: null },
      },
      orderBy: { createdAt: "asc" },
    });
    if (toPush.length === 0) {
      throw new HttpError(
        400,
        "nothing_to_push",
        "No drafted recipients with email, subject, and body. Generate drafts first.",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        defaultSignature: true,
        resumeStorageKey: true,
        resumeFileName: true,
        resumeMimeType: true,
      },
    });

    // Save chosen sending account on the project so reloads remember it.
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sendingProviderAccountId: parsed.data.providerAccountId,
      },
    });

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < toPush.length; i += CONCURRENCY) {
      const slice = toPush.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (r) => {
          try {
            const attachments = await collectOutboundAttachments({
              userId,
              attachResume: campaign.attachResume,
              resumeStorageKey: user?.resumeStorageKey ?? null,
              resumeFileName: user?.resumeFileName ?? null,
              resumeMimeType: user?.resumeMimeType ?? null,
              extraAttachments: r.extraAttachments,
            });
            const result = await provider.createDraft(accessToken, {
              from: {
                email: providerUserEmail,
                name: user?.name ?? undefined,
              },
              to: [
                {
                  email: r.email!,
                  name: r.name ?? undefined,
                },
              ],
              subject: r.subject!,
              bodyText: withAppendedSignature(
                withAppendedResumeMention(r.body!, {
                  attachResume: campaign.attachResume,
                  hasResume: Boolean(user?.resumeStorageKey),
                }),
                user?.defaultSignature ?? null,
              ),
              campaignId: campaign.id,
              attachments: attachments.length ? attachments : undefined,
            });
            await prisma.recipientDraft.update({
              where: { id: r.id },
              data: {
                status: "pushed",
                providerDraftId: result.providerDraftId,
                providerThreadId: result.providerThreadId ?? null,
                deepLink: result.deepLink,
                errorReason: null,
              },
            });
            successes++;
          } catch (e) {
            await prisma.recipientDraft.update({
              where: { id: r.id },
              data: {
                status: "error",
                errorReason: (e as Error).message.slice(0, 500),
              },
            });
            failures++;
          }
        }),
      );
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "pushed" },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "push_drafts",
        metadata: {
          campaignId: campaign.id,
          successes,
          failures,
          providerUserEmail,
        },
      },
    });

    logger.info("project.push.done", {
      projectId: campaign.id,
      successes,
      failures,
    });

    const fresh = await prisma.recipientDraft.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      successes,
      failures,
      recipients: fresh.map(recipientToClientJson),
    });
  },
);
