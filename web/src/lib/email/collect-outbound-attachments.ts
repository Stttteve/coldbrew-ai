import { readUploadFile } from "@/lib/uploads/storage";
import {
  parseStoredExtraAttachments,
  type StoredExtraAttachment,
} from "@/lib/recipients/attachment-types";

export type OutboundMimeAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export async function collectOutboundAttachments(params: {
  userId: string;
  attachResume: boolean;
  resumeStorageKey: string | null;
  resumeFileName: string | null;
  resumeMimeType: string | null;
  extraAttachments: unknown;
}): Promise<OutboundMimeAttachment[]> {
  const out: OutboundMimeAttachment[] = [];

  if (
    params.attachResume &&
    params.resumeStorageKey &&
    params.resumeFileName
  ) {
    const buf = await readUploadFile(params.userId, params.resumeStorageKey);
    if (buf) {
      out.push({
        filename: params.resumeFileName,
        content: buf,
        contentType:
          params.resumeMimeType ?? "application/octet-stream",
      });
    }
  }

  const extras: StoredExtraAttachment[] = parseStoredExtraAttachments(
    params.extraAttachments,
  );
  for (const a of extras) {
    const buf = await readUploadFile(params.userId, a.storageKey);
    if (buf) {
      out.push({
        filename: a.fileName,
        content: buf,
        contentType: a.mimeType,
      });
    }
  }

  return out;
}
