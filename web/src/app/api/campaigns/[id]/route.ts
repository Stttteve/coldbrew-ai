import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { deleteRecipientUploadDir } from "@/lib/uploads/storage";
import {
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import { briefingSchema } from "@/lib/llm/schemas";

/**
 * GET    /api/campaigns/:id  — load one project with its recipient summary
 * PATCH  /api/campaigns/:id  — update name / briefing / purposeCategory / sendingProviderAccountId
 * DELETE /api/campaigns/:id  — hard delete (cascades to RecipientDraft)
 */

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  briefing: briefingSchema.partial().optional(),
  sendingProviderAccountId: z.string().uuid().nullable().optional(),
  attachResume: z.boolean().optional(),
});

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    await requireOwnedCampaign(ctx.params.id, userId);
    const campaign = await prisma.campaign.findUnique({
      where: { id: ctx.params.id },
      include: {
        recipients: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            name: true,
            title: true,
            organization: true,
            linkedinUrl: true,
            subject: true,
            body: true,
            status: true,
            referencedFacts: true,
            providerDraftId: true,
            deepLink: true,
            errorReason: true,
            extraAttachments: true,
          },
        },
        sendingProviderAccount: {
          select: { id: true, providerUserEmail: true, status: true },
        },
      },
    });
    return NextResponse.json({ project: campaign });
  },
);

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    await requireOwnedCampaign(ctx.params.id, userId);
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const patch = parsed.data;

    const updated = await prisma.campaign.update({
      where: { id: ctx.params.id },
      data: {
        name: patch.name,
        briefing: patch.briefing ?? undefined,
        purposeCategory: patch.briefing?.purpose_category,
        sendingProviderAccountId:
          patch.sendingProviderAccountId === undefined
            ? undefined
            : patch.sendingProviderAccountId,
        attachResume:
          patch.attachResume === undefined ? undefined : patch.attachResume,
      },
      select: {
        id: true,
        name: true,
        briefing: true,
        status: true,
        attachResume: true,
      },
    });
    return NextResponse.json({ project: updated });
  },
);

export const DELETE = withErrorHandler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    await requireOwnedCampaign(ctx.params.id, userId);
    const rows = await prisma.recipientDraft.findMany({
      where: { campaignId: ctx.params.id },
      select: { id: true },
    });
    for (const r of rows) {
      await deleteRecipientUploadDir(userId, r.id);
    }
    await prisma.campaign.delete({ where: { id: ctx.params.id } });
    return NextResponse.json({ ok: true });
  },
);
