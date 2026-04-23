/** Allowed MIME types for resume + per-recipient attachments. */
export const ALLOWED_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const MAX_RESUME_BYTES = 12 * 1024 * 1024;
export const MAX_EXTRA_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_EXTRA_ATTACHMENTS_PER_RECIPIENT = 5;

export function extForMime(mime: string): string {
  if (mime === "application/pdf") return ".pdf";
  if (mime === "application/msword") return ".doc";
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return ".docx";
  return "";
}
