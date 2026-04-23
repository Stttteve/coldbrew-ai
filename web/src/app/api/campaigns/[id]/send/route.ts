import { NextResponse } from "next/server";
import { RecipientStatus } from "@prisma/client";
import { z } from "zod";

import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { withAppendedSignature } from "@/lib/email/compose-signature";
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
 * POST /api/campaigns/:id/send
 * Body: { providerAccountId: string }
 *
 * Sends every recipient in `drafted`, `approved`, or `pushed` (no Approve
 * required) via Gmail users.messages.send. Skips `sent`.
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
    if (!provider.sendMessage) {
      throw new HttpError(
        501,
        "provider_does_not_support_send",
        "This inbox provider cannot send mail from Coldbrew yet.",
      );
    }

    const toSend = await prisma.recipientDraft.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ["drafted", "approved", "pushed"] },
        email: { not: null },
        subject: { not: null },
        body: { not: null },
      },
      orderBy: { createdAt: "asc" },
    });
    if (toSend.length === 0) {
      throw new HttpError(
        400,
        "nothing_to_send",
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

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sendingProviderAccountId: parsed.data.providerAccountId,
      },
    });

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < toSend.length; i += CONCURRENCY) {
      const slice = toSend.slice(i, i + CONCURRENCY);
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
            const result = await provider.sendMessage!(accessToken, {
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
                r.body!,
                user?.defaultSignature ?? null,
              ),
              campaignId: campaign.id,
              attachments: attachments.length ? attachments : undefined,
            });
            await prisma.recipientDraft.update({
              where: { id: r.id },
              data: {
                status: RecipientStatus.sent,
                providerDraftId: result.providerMessageId,
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
        action: "collective_send",
        metadata: {
          campaignId: campaign.id,
          successes,
          failures,
          providerUserEmail,
        },
      },
    });

    logger.info("project.send.done", {
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
