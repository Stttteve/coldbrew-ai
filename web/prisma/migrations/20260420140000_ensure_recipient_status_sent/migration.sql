-- Idempotent: add `sent` if missing (safe when 20260420133000 already ran or never ran).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'RecipientStatus'
      AND e.enumlabel = 'sent'
  ) THEN
    ALTER TYPE "RecipientStatus" ADD VALUE 'sent';
  END IF;
END
$$;
