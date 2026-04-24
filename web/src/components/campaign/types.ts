/**
 * Shared client types for project (outreach) UI. Must stay JSON-safe (no Date).
 */

export type ExtraAttachmentView = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type RecipientStatus =
  | "pending"
  | "enriching"
  | "enriched"
  | "drafting"
  | "drafted"
  | "approved"
  | "pushed"
  | "error"
  | "sent";

export interface RecipientView {
  id: string;
  email: string | null;
  name: string | null;
  title: string | null;
  organization: string | null;
  linkedinUrl: string | null;
  subject: string | null;
  body: string | null;
  status: RecipientStatus;
  referencedFacts: string[];
  providerDraftId: string | null;
  deepLink: string | null;
  errorReason: string | null;
  /** Per-recipient files attached on Gmail push/send. */
  extraAttachments?: ExtraAttachmentView[];
  /** Reply tracking (populated after send + a poll cycle). */
  repliedAt?: string | null;
  replyCount?: number;
  lastReplyAt?: string | null;
  lastReplyFrom?: string | null;
  lastReplySnippet?: string | null;
}
