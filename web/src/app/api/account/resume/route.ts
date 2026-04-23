import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { HttpError, requireUserId, withErrorHandler } from "@/lib/guards";
import {
  ALLOWED_ATTACHMENT_MIMES,
  MAX_RESUME_BYTES,
} from "@/lib/uploads/config";
import {
  deleteUploadFile,
  writeUserResume,
} from "@/lib/uploads/storage";
import { logger } from "@/lib/logger";

/**
 * POST   /api/account/resume — multipart field `file` (PDF / Word)
 * DELETE /api/account/resume — remove saved resume
 */

export const POST = withErrorHandler(async (req: Request) => {
  const userId = await requireUserId();
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
  if (buf.length > MAX_RESUME_BYTES) {
    throw new HttpError(400, "file_too_large", `Max ${MAX_RESUME_BYTES / 1024 / 1024} MB.`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { resumeStorageKey: true },
  });
  if (user?.resumeStorageKey) {
    await deleteUploadFile(userId, user.resumeStorageKey);
  }

  let storageKey: string;
  try {
    const out = await writeUserResume(
      userId,
      buf,
      mime,
      file.name || "resume",
    );
    storageKey = out.storageKey;
  } catch {
    throw new HttpError(400, "invalid_resume", "Could not store file.");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      resumeFileName: file.name || "resume",
      resumeMimeType: mime,
      resumeStorageKey: storageKey,
    },
    select: {
      resumeFileName: true,
      resumeMimeType: true,
    },
  });

  logger.info("account.resume_uploaded", { userId });

  return NextResponse.json({ ok: true, resume: updated });
});

export const DELETE = withErrorHandler(async () => {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { resumeStorageKey: true },
  });
  if (user?.resumeStorageKey) {
    await deleteUploadFile(userId, user.resumeStorageKey);
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      resumeFileName: null,
      resumeMimeType: null,
      resumeStorageKey: null,
    },
  });
  return NextResponse.json({ ok: true });
});
