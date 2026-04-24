-- Reply tracking: persist Gmail threadId per recipient and record detected replies.

ALTER TABLE "RecipientDraft"
  ADD COLUMN IF NOT EXISTS "providerThreadId" TEXT,
  ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "replyCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastReplyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastReplyFrom" TEXT,
  ADD COLUMN IF NOT EXISTS "lastReplySnippet" TEXT,
  ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "RecipientDraft_providerThreadId_idx"
  ON "RecipientDraft" ("providerThreadId");

CREATE INDEX IF NOT EXISTS "RecipientDraft_repliedAt_idx"
  ON "RecipientDraft" ("repliedAt");
