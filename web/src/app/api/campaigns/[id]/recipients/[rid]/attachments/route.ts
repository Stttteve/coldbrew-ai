import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { prisma } from "@/lib/db";
import {
  HttpError,
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import {
  parseStoredExtraAttachments,
  storedExtraAttachmentSchema,
} from "@/lib/recipients/attachment-types";
import {
  ALLOWED_ATTACHMENT_MIMES,
  MAX_EXTRA_ATTACHMENT_BYTES,
  MAX_EXTRA_ATTACHMENTS_PER_RECIPIENT,
} from "@/lib/uploads/config";
import {
  deleteUploadFile,
  writeRecipientAttachment,
} from "@/lib/uploads/storage";

/**
 * POST   /api/campaigns/:id/recipients/:rid/attachments — multipart `file`
 * DELETE /api/campaigns/:id/recipients/:rid/attachments?attachmentId=uuid
 */

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: { id: string; rid: string } }) => {
    const userId = await requireUserId();
    await requireOwnedCampaign(ctx.params.id, userId);

    const existing = await prisma.recipientDraft.findUnique({
      where: { id: ctx.params.rid },
    });
    if (!existing || existing.campaignId !== ctx.params.id) {
      throw new HttpError(404, "recipient_not_found");
    }

    const form = await req.formData().catch(() => null);
    if (!form) throw new HttpError(400, "invalid_input");
    const entry = form.get("file");
    if (!entry || typeof entry === "string") {
      throw new HttpError(400, "missing_file", "Expected multipart field `file`.");
    }
    const file = entry as File;
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_ATTACHMENT_MIMES.has(mime)) {
      throw new HttpError(
        400,
        "unsupported_type",
        "Only PDF and Word (.doc, .docx) are allowed.",
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) throw new HttpError(400, "empty_file");
    if (buf.length > MAX_EXTRA_ATTACHMENT_BYTES) {
      throw new HttpError(
        400,
        "file_too_large",
        `Max ${MAX_EXTRA_ATTACHMENT_BYTES / 1024 / 1024} MB per file.`,
      );
    }

    const current = parseStoredExtraAttachments(existing.extraAttachments);
    if (current.length >= MAX_EXTRA_ATTACHMENTS_PER_RECIPIENT) {
      throw new HttpError(
        400,
        "too_many_attachments",
        `At most ${MAX_EXTRA_ATTACHMENTS_PER_RECIPIENT} extra files per recipient.`,
      );
    }

    const { storageKey } = await writeRecipientAttachment(
      userId,
      existing.id,
      buf,
      mime,
      file.name || "attachment",
    );

    const row = storedExtraAttachmentSchema.parse({
      id: randomUUID(),
      storageKey,
      fileName: file.name || "attachment",
      mimeType: mime,
      size: buf.length,
    });

    const next = [...current, row];

    const updated = await prisma.recipientDraft.update({
      where: { id: existing.id },
      data: { extraAttachments: next },
    });

    return NextResponse.json({ recipient: recipientToClientJson(updated) });
  },
);

export const DELETE = withErrorHandler(
  async (req: Request, ctx: { params: { id: string; rid: string } }) => {
    const userId = await requireUserId();
    await requireOwnedCampaign(ctx.params.id, userId);

    const url = new URL(req.url);
    const attachmentId = url.searchParams.get("attachmentId");
    if (!attachmentId) throw new HttpError(400, "missing_attachment_id");

    const existing = await prisma.recipientDraft.findUnique({
      where: { id: ctx.params.rid },
    });
    if (!existing || existing.campaignId !== ctx.params.id) {
      throw new HttpError(404, "recipient_not_found");
    }

    const current = parseStoredExtraAttachments(existing.extraAttachments);
    const found = current.find((a) => a.id === attachmentId);
    if (!found) throw new HttpError(404, "attachment_not_found");

    await deleteUploadFile(userId, found.storageKey);
    const next = current.filter((a) => a.id !== attachmentId);

    const updated = await prisma.recipientDraft.update({
      where: { id: existing.id },
      data: {
        extraAttachments: next.length
          ? (next as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });

    return NextResponse.json({ recipient: recipientToClientJson(updated) });
  },
);
