import { NextResponse } from "next/server";
import { z } from "zod";

import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { prisma } from "@/lib/db";
import { deleteRecipientUploadDir } from "@/lib/uploads/storage";
import { findPlaceholderSnippetsInBody } from "@/lib/llm/validators";
import {
  HttpError,
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";

/**
 * PATCH  /api/campaigns/:id/recipients/:rid
 * DELETE /api/campaigns/:id/recipients/:rid
 *
 * PATCH lets the user tweak contact fields, edit the generated draft inline,
 * or flip status between `drafted` and `approved`.
 */

const patchSchema = z.object({
  email: z.string().email().max(256).nullable().optional(),
  name: z.string().max(200).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  organization: z.string().max(200).nullable().optional(),
  linkedinUrl: z.string().url().max(500).nullable().optional(),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().max(8000).nullable().optional(),
  status: z.enum(["approved", "drafted"]).optional(),
});

export const PATCH = withErrorHandler(
  async (
    req: Request,
    ctx: { params: { id: string; rid: string } },
  ) => {
    const userId = await requireUserId();
    await requireOwnedCampaign(ctx.params.id, userId);
    const existing = await prisma.recipientDraft.findUnique({
      where: { id: ctx.params.rid },
    });
    if (!existing || existing.campaignId !== ctx.params.id) {
      throw new HttpError(404, "recipient_not_found");
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "invalid_input");

    const data = parsed.data;

    const clearErrorIfBodyClean =
      data.body !== undefined &&
      findPlaceholderSnippetsInBody(data.body ?? "").length === 0;

    const updated = await prisma.recipientDraft.update({
      where: { id: existing.id },
      data: {
        email: data.email === undefined ? undefined : data.email ?? null,
        name: data.name === undefined ? undefined : data.name ?? null,
        title: data.title === undefined ? undefined : data.title ?? null,
        organization:
          data.organization === undefined ? undefined : data.organization ?? null,
        linkedinUrl:
          data.linkedinUrl === undefined ? undefined : data.linkedinUrl ?? null,
        subject: data.subject === undefined ? undefined : data.subject ?? null,
        body: data.body === undefined ? undefined : data.body ?? null,
        status: data.status,
        ...(clearErrorIfBodyClean ? { errorReason: null } : {}),
      },
    });

    return NextResponse.json({
      recipient: recipientToClientJson(updated),
    });
  },
);

export const DELETE = withErrorHandler(
  async (_req: Request, ctx: { params: { id: string; rid: string } }) => {
    const userId = await requireUserId();
    await requireOwnedCampaign(ctx.params.id, userId);
    const existing = await prisma.recipientDraft.findUnique({
      where: { id: ctx.params.rid },
    });
    if (!existing || existing.campaignId !== ctx.params.id) {
      throw new HttpError(404, "recipient_not_found");
    }
    await deleteRecipientUploadDir(userId, existing.id);
    await prisma.recipientDraft.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  },
);
