import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { deleteAllUserUploads } from "@/lib/uploads/storage";
import { decryptSecret } from "@/lib/crypto";
import { gmailProvider } from "@/lib/providers/gmail";
import { requireUserId, withErrorHandler } from "@/lib/guards";
import { logger } from "@/lib/logger";

/**
 * POST /api/account/delete
 *
 * Best-effort account teardown:
 *   1. Revoke every provider grant at its upstream (Google, etc).
 *   2. Delete the User row. Cascade clears projects (campaign rows), recipients,
 *      provider accounts, sessions, and accounts (Auth.js). AuditLog entries
 *      are set to null user_id instead (preserved for compliance).
 *
 * We DON'T wait for upstream revocations — if Google is slow/down we still
 * delete locally; the old refresh tokens will expire naturally.
 */
export const POST = withErrorHandler(async () => {
  const userId = await requireUserId();

  // Revoke upstream grants in parallel, ignoring failures.
  const grants = await prisma.providerAccount.findMany({
    where: { userId },
    select: { id: true, provider: true, refreshTokenCipher: true },
  });
  await Promise.all(
    grants.map(async (g) => {
      try {
        const refreshToken = decryptSecret(Buffer.from(g.refreshTokenCipher));
        if (g.provider === "google") await gmailProvider.revoke(refreshToken);
        // Microsoft / Nylas revocation: added in v1.5 / v2.
      } catch (e) {
        logger.warn("account.delete.revoke_failed", {
          providerAccountId: g.id,
          message: (e as Error).message,
        });
      }
    }),
  );

  await prisma.auditLog.create({
    data: {
      userId,
      action: "delete_account",
      metadata: { grants: grants.length },
    },
  });

  await deleteAllUserUploads(userId);

  // The FK `AuditLog.userId` uses `onDelete: SetNull`, so this works
  // even though an audit row for this user was just inserted.
  await prisma.user.delete({ where: { id: userId } });

  logger.info("account.deleted", { userId });

  return NextResponse.json({ ok: true });
});
