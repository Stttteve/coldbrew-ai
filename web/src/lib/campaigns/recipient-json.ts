import type { RecipientDraft } from "@prisma/client";

import {
  parseStoredExtraAttachments,
  toAttachmentViews,
  type ExtraAttachmentView,
} from "@/lib/recipients/attachment-types";

export type RecipientClientJson = {
  id: string;
  email: string | null;
  name: string | null;
  title: string | null;
  organization: string | null;
  linkedinUrl: string | null;
  subject: string | null;
  body: string | null;
  status: RecipientDraft["status"];
  referencedFacts: string[];
  providerDraftId: string | null;
  deepLink: string | null;
  errorReason: string | null;
  extraAttachments: ExtraAttachmentView[];
};

export function recipientToClientJson(r: RecipientDraft): RecipientClientJson {
  const extras = parseStoredExtraAttachments(r.extraAttachments);
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    title: r.title,
    organization: r.organization,
    linkedinUrl: r.linkedinUrl,
    subject: r.subject,
    body: r.body,
    status: r.status,
    referencedFacts: r.referencedFacts,
    providerDraftId: r.providerDraftId,
    deepLink: r.deepLink,
    errorReason: r.errorReason,
    extraAttachments: toAttachmentViews(extras),
  };
}
