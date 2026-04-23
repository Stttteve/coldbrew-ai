/**
 * Uniform interface for every email provider we connect to (Gmail, Microsoft
 * Graph, Nylas, etc). All outbound side-effects the app performs MUST go
 * through this interface — no direct API calls from route handlers.
 *
 * This lets us:
 *   - test the app against a fake in-memory provider
 *   - add Outlook in v1.5 without touching business logic
 *   - add Nylas in v2 as a catch-all for Yahoo / iCloud / IMAP
 */

export type ProviderKind = "google" | "microsoft" | "nylas";

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface DraftMessage {
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  campaignId?: string; // used for X-Campaign-Id header + labeling
  attachments?: MailAttachment[];
}

export interface CreatedDraft {
  providerDraftId: string;
  deepLink: string;
}

/** Result of sending a message via Gmail `users.messages.send`. */
export interface SentMessage {
  providerMessageId: string;
  deepLink: string;
}

export interface MailProvider {
  readonly kind: ProviderKind;

  /** Exchange an OAuth code for tokens and fetch the authenticated email address. */
  exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<{
    tokens: ProviderTokens;
    email: string;
  }>;

  /** Refresh an expiring access token using the stored refresh token. */
  refresh(refreshToken: string): Promise<ProviderTokens>;

  /** Revoke the grant entirely (called on user "Disconnect"). */
  revoke(refreshToken: string): Promise<void>;

  /** Create a draft in the user's mailbox. */
  createDraft(accessToken: string, msg: DraftMessage): Promise<CreatedDraft>;

  /** Send a message immediately (Gmail: users.messages.send). Optional until Outlook exists. */
  sendMessage?(
    accessToken: string,
    msg: DraftMessage,
  ): Promise<SentMessage>;
}
