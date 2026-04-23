import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { stableHash } from "@/lib/crypto";
import { withErrorHandler } from "@/lib/guards";
import { logger } from "@/lib/logger";

/**
 * POST /api/data-request
 *
 * Public endpoint for data subjects (GDPR Art. 15 access / Art. 17 erasure).
 * We don't require auth — data subjects are specifically the people who do
 * NOT have accounts with us. Abuse protection: rate-limited in prod via
 * middleware (TODO in Phase 3), and the request is logged for review before
 * action so a human confirms before we delete anything.
 *
 * For erasure requests we immediately wipe any matching EnrichmentCache row
 * (hashed key, so it's a one-shot lookup). Broader audit lives in AuditLog.
 */

const schema = z.object({
  email: z.string().email().optional(),
  linkedin: z.string().url().optional(),
  reason: z.enum(["delete", "access"]),
  note: z.string().max(2000).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.email && !parsed.data.linkedin)) {
    return NextResponse.json(
      { error: "invalid_input" },
      { status: 400 },
    );
  }

  const { email, linkedin, reason, note } = parsed.data;

  // Immediate cache purge for delete requests.
  let purged = 0;
  if (reason === "delete") {
    const keys: string[] = [];
    if (email) keys.push("em|" + stableHash(email.toLowerCase()));
    if (linkedin) keys.push("li|" + stableHash(linkedin.toLowerCase()));
    const result = await prisma.enrichmentCache.deleteMany({
      where: { keyHash: { in: keys } },
    });
    purged = result.count;
  }

  await prisma.auditLog.create({
    data: {
      action: `data_request:${reason}`,
      metadata: {
        email: email ? "[redacted]" : undefined,
        email_hash: email ? stableHash(email.toLowerCase()) : undefined,
        linkedin_hash: linkedin ? stableHash(linkedin.toLowerCase()) : undefined,
        note,
        purged_cache_rows: purged,
      },
    },
  });

  logger.info("data_request.received", {
    reason,
    hasEmail: !!email,
    hasLinkedin: !!linkedin,
    purged,
  });

  return NextResponse.json({ ok: true });
});
