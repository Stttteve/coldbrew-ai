import { z } from "zod";

/** Stored on RecipientDraft.extraAttachments (includes storageKey). */
export const storedExtraAttachmentSchema = z.object({
  id: z.string().uuid(),
  storageKey: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive(),
});

export type StoredExtraAttachment = z.infer<typeof storedExtraAttachmentSchema>;

export function parseStoredExtraAttachments(raw: unknown): StoredExtraAttachment[] {
  const arr = z.array(storedExtraAttachmentSchema).safeParse(raw);
  return arr.success ? arr.data : [];
}

/** JSON-safe shape for the client (no storageKey). */
export type ExtraAttachmentView = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export function toAttachmentViews(
  list: StoredExtraAttachment[],
): ExtraAttachmentView[] {
  return list.map(({ id, fileName, mimeType, size }) => ({
    id,
    fileName,
    mimeType,
    size,
  }));
}
