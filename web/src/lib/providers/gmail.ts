import MailComposer from "nodemailer/lib/mail-composer";

import {
  normalizePlainTextForOutboundEmail,
  plainTextToHtmlEmailFragment,
} from "@/lib/email/format-outbound-body";
import type {
  CreatedDraft,
  DraftMessage,
  MailProvider,
  ProviderTokens,
  SentMessage,
} from "./types";
import {
  exchangeCode as oauthExchangeCode,
  refreshTokens,
  revokeToken,
} from "./google-oauth";

/**
 * Gmail provider adapter. Implements the MailProvider interface by wrapping
 * the Google OAuth primitives and the Gmail drafts.create REST endpoint.
 *
 * MIME construction delegates to nodemailer's MailComposer, which handles
 * all the edge cases (non-ASCII subjects via RFC 2047, quoted-printable
 * encoding where needed, correct boundary generation). The one thing we
 * inject ourselves is the `X-Campaign-Id` header for later thread tracking.
 */

const GMAIL_DRAFTS_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildRfc822(msg: DraftMessage): Promise<Buffer> {
  const bodyText = normalizePlainTextForOutboundEmail(msg.bodyText);
  const bodyHtml = msg.bodyHtml?.trim()
    ? msg.bodyHtml.trim()
    : plainTextToHtmlEmailFragment(bodyText);
  const composer = new MailComposer({
    from: msg.from.name
      ? { name: msg.from.name, address: msg.from.email }
      : msg.from.email,
    to: msg.to.map((r) =>
      r.name ? { name: r.name, address: r.email } : r.email,
    ),
    subject: msg.subject,
    text: bodyText,
    html: bodyHtml,
    headers: msg.campaignId ? { "X-Campaign-Id": msg.campaignId } : undefined,
    textEncoding: "quoted-printable",
    attachments: msg.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}

export const gmailProvider: MailProvider = {
  kind: "google",

  async exchangeCode(code, verifier, redirectUri) {
    return oauthExchangeCode(code, verifier, redirectUri);
  },

  async refresh(refreshToken): Promise<ProviderTokens> {
    return refreshTokens(refreshToken);
  },

  async revoke(refreshToken): Promise<void> {
    return revokeToken(refreshToken);
  },

  async createDraft(accessToken, msg): Promise<CreatedDraft> {
    const mime = await buildRfc822(msg);
    const raw = base64url(mime);
    const res = await fetch(GMAIL_DRAFTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    });
    if (!res.ok) {
      throw new Error(
        `Gmail drafts.create failed (${res.status}): ${await res.text()}`,
      );
    }
    const data = (await res.json()) as {
      id: string;
      message: { id: string; threadId: string };
    };
    return {
      providerDraftId: data.id,
      deepLink: `https://mail.google.com/mail/u/0/#drafts/${data.message.id}`,
    };
  },

  async sendMessage(accessToken, msg): Promise<SentMessage> {
    const mime = await buildRfc822(msg);
    const raw = base64url(mime);
    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      throw new Error(
        `Gmail messages.send failed (${res.status}): ${await res.text()}`,
      );
    }
    const data = (await res.json()) as { id: string; threadId?: string };
    const thread = data.threadId ?? data.id;
    return {
      providerMessageId: data.id,
      deepLink: `https://mail.google.com/mail/u/0/#all/${thread}`,
    };
  },
};

// Re-export the RFC-822 builder for unit testing. It's internal to this file,
// but we want to be able to verify the bytes without network.
export const __testables__ = { buildRfc822 };
