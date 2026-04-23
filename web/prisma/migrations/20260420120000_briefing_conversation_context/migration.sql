-- Persist briefing chat transcript for draft generation (structured briefing JSON stays separate).
ALTER TABLE "Campaign" ADD COLUMN "briefingConversationContext" TEXT;
