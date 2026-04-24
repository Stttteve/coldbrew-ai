import { NextResponse } from "next/server";
import { RecipientStatus } from "@prisma/client";
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
 * POST /api/campaigns/:id/recipients/:rid/send
 * Body: { providerAccountId: string }
 *
 * Sends one message via Gmail users.messages.send. Allowed statuses:
 * drafted, approved, or pushed (e.g. already saved as a Gmail draft).
 */

const bodySchema = z.object({
  providerAccountId: z.string().uuid(),
});

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: { id: string; rid: string } }) => {
    const userId = await requireUserId();
    const campaign = await requireOwnedCampaign(ctx.params.id, userId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "invalid_input");

    const r = await prisma.recipientDraft.findUnique({
      where: { id: ctx.params.rid },
    });
    if (!r || r.campaignId !== campaign.id) {
      throw new HttpError(404, "recipient_not_found");
    }
    // Allow re-sending: a previous "sent" recipient can be sent again (e.g.
    // follow-up after edits). This appends another message to the thread —
    // Gmail handles it as a reply if the In-Reply-To is preserved (we don't
    // set it explicitly, so it'll be a fresh message in the same thread).
    if (
      r.status !== "drafted" &&
      r.status !== "approved" &&
      r.status !== "pushed" &&
      r.status !== "sent"
    ) {
      throw new HttpError(
        400,
        "cannot_send",
        "Need a generated draft before sending.",
      );
    }
    if (!r.email?.trim() || !r.subject?.trim() || !r.body?.trim()) {
      throw new HttpError(400, "incomplete_draft", "Email, subject, and body are required.");
    }

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
      data: { sendingProviderAccountId: parsed.data.providerAccountId },
    });

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
        to: [{ email: r.email, name: r.name ?? undefined }],
        subject: r.subject,
        bodyText: withAppendedSignature(
          withAppendedResumeMention(r.body, {
            attachResume: campaign.attachResume,
            hasResume: Boolean(user?.resumeStorageKey),
          }),
          user?.defaultSignature ?? null,
        ),
        campaignId: campaign.id,
        attachments: attachments.length ? attachments : undefined,
      });
      const updated = await prisma.recipientDraft.update({
        where: { id: r.id },
        data: {
          status: RecipientStatus.sent,
          providerDraftId: result.providerMessageId,
          providerThreadId: result.providerThreadId ?? null,
          deepLink: result.deepLink,
          errorReason: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          action: "send_one_recipient",
          metadata: {
            campaignId: campaign.id,
            recipientId: r.id,
            providerUserEmail,
          },
        },
      });

      logger.info("recipient.send.done", {
        projectId: campaign.id,
        recipientId: r.id,
      });

      return NextResponse.json({
        recipient: recipientToClientJson(updated),
      });
    } catch (e) {
      await prisma.recipientDraft.update({
        where: { id: r.id },
        data: {
          status: "error",
          errorReason: (e as Error).message.slice(0, 500),
        },
      });
      throw new HttpError(502, "send_failed", (e as Error).message);
    }
  },
);
