import { randomUUID } from "crypto";
import { mkdir, readFile, rm, unlink, writeFile } from "fs/promises";
import path from "path";

import { extForMime } from "./config";

function uploadRoot(): string {
  return path.join(process.cwd(), "data", "uploads");
}

function assertSafeUserKey(userId: string, storageKey: string): void {
  const prefix = `${userId}/`;
  if (!storageKey.startsWith(prefix)) {
    throw new Error("invalid_storage_key");
  }
  const resolved = path.resolve(uploadRoot(), storageKey);
  const root = path.resolve(uploadRoot());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("path_traversal");
  }
}

export async function ensureUploadRoot(): Promise<void> {
  await mkdir(uploadRoot(), { recursive: true });
}

export async function writeUserResume(
  userId: string,
  buffer: Buffer,
  mime: string,
  _originalFileName: string,
): Promise<{ storageKey: string }> {
  void _originalFileName;
  await ensureUploadRoot();
  const ext = extForMime(mime);
  if (!ext) throw new Error("unsupported_mime");
  const storageKey = path.join(userId, `resume${ext}`).replace(/\\/g, "/");
  const dir = path.join(uploadRoot(), userId);
  await mkdir(dir, { recursive: true });
  const abs = path.join(uploadRoot(), storageKey);
  await writeFile(abs, buffer);
  return { storageKey };
}

export async function writeRecipientAttachment(
  userId: string,
  recipientId: string,
  buffer: Buffer,
  mime: string,
  originalFileName: string,
): Promise<{ storageKey: string }> {
  await ensureUploadRoot();
  const ext = extForMime(mime);
  if (!ext) throw new Error("unsupported_mime");
  const safeBase = sanitizeFileBase(originalFileName, ext);
  const id = randomUUID();
  const storageKey = path
    .join(userId, "recipients", recipientId, `${id}_${safeBase}`)
    .replace(/\\/g, "/");
  const dir = path.dirname(path.join(uploadRoot(), storageKey));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(uploadRoot(), storageKey), buffer);
  return { storageKey };
}

function sanitizeFileBase(name: string, ext: string): string {
  const base = path.basename(name).replace(/[^\w.\-()+ ]/g, "_").slice(0, 80);
  const withoutExt = base.replace(/\.(pdf|docx?)$/i, "");
  return (withoutExt || "attachment") + ext;
}

export async function readUploadFile(
  userId: string,
  storageKey: string,
): Promise<Buffer | null> {
  assertSafeUserKey(userId, storageKey);
  const abs = path.join(uploadRoot(), storageKey);
  try {
    return await readFile(abs);
  } catch {
    return null;
  }
}

export async function deleteUploadFile(
  userId: string,
  storageKey: string,
): Promise<void> {
  assertSafeUserKey(userId, storageKey);
  const abs = path.join(uploadRoot(), storageKey);
  try {
    await unlink(abs);
  } catch {
    /* ignore */
  }
}

/** Remove all files for a user (account delete). */
export async function deleteAllUserUploads(userId: string): Promise<void> {
  const dir = path.join(uploadRoot(), userId);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Remove every per-recipient file for one row (before deleting the row). */
export async function deleteRecipientUploadDir(
  userId: string,
  recipientId: string,
): Promise<void> {
  const dir = path.join(uploadRoot(), userId, "recipients", recipientId);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
