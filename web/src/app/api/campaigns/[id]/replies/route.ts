import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { checkReplies } from "@/lib/replies/check";

/**
 * POST /api/campaigns/:id/replies
 * Manual "Refresh replies" action. Forces a Gmail thread poll for every
 * sent recipient in the project regardless of lastCheckedAt throttle, then
 * returns the updated recipients so the UI can repaint without a reload.
 */
export const POST = withErrorHandler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    const campaign = await requireOwnedCampaign(ctx.params.id, userId);

    const result = await checkReplies(
      { kind: "campaign", campaignId: campaign.id, userId },
      { force: true },
    );

    const fresh = await prisma.recipientDraft.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      ...result,
      recipients: fresh.map(recipientToClientJson),
    });
  },
);
