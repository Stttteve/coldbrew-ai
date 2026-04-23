-- User resume (PDF / Word), project-level attach flag, per-recipient extras
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resumeFileName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resumeMimeType" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resumeStorageKey" TEXT;

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "attachResume" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RecipientDraft" ADD COLUMN IF NOT EXISTS "extraAttachments" JSONB;
