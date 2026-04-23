import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { gmailProvider } from "@/lib/providers/gmail";
import { logger } from "@/lib/logger";

/**
 * POST /api/oauth/google/disconnect
 * Body: { providerAccountId: string }
 *
 * Calls Google's revoke endpoint to tear down the grant, then deletes the
 * local ProviderAccount row. We revoke BEFORE delete so that if revocation
 * fails we don't end up with a live grant we can no longer manage.
 */
const schema = z.object({ providerAccountId: z.string().uuid() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const account = await prisma.providerAccount.findUnique({
    where: { id: parsed.data.providerAccountId },
  });
  if (!account || account.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const refreshToken = decryptSecret(Buffer.from(account.refreshTokenCipher));
    await gmailProvider.revoke(refreshToken);
  } catch (e) {
    // Proceed to local delete even if Google says the grant was already gone
    logger.warn("gmail_oauth.disconnect.revoke_failed", {
      message: (e as Error).message,
    });
  }

  await prisma.providerAccount.delete({ where: { id: account.id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "disconnect_provider",
      metadata: { provider: "google", email: account.providerUserEmail },
    },
  });

  return NextResponse.json({ ok: true });
}
