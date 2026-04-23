import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { getProvider } from "@/lib/providers";
import { HttpError } from "@/lib/guards";

/**
 * Returns a usable access token for a ProviderAccount, refreshing it if the
 * stored one is within 60s of expiry. Mutates the DB row on success so other
 * calls within the same user session benefit from the refreshed token.
 *
 * Any failure (network, invalid_grant, etc) marks the account as `error`
 * so the next UI render prompts a re-connect.
 */

const REFRESH_SKEW_MS = 60_000;

export async function getUsableAccessToken(
  providerAccountId: string,
  userId: string,
): Promise<{
  accessToken: string;
  providerUserEmail: string;
  provider: "google" | "microsoft" | "nylas";
}> {
  const acct = await prisma.providerAccount.findUnique({
    where: { id: providerAccountId },
  });
  if (!acct || acct.userId !== userId) {
    throw new HttpError(404, "provider_account_not_found");
  }
  if (acct.status !== "active") {
    throw new HttpError(409, "provider_account_inactive");
  }

  const needsRefresh =
    acct.tokenExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;

  if (!needsRefresh) {
    return {
      accessToken: decryptSecret(Buffer.from(acct.accessTokenCipher)),
      providerUserEmail: acct.providerUserEmail,
      provider: acct.provider,
    };
  }

  const provider = getProvider(acct.provider);
  try {
    const refreshToken = decryptSecret(Buffer.from(acct.refreshTokenCipher));
    const refreshed = await provider.refresh(refreshToken);
    const updated = await prisma.providerAccount.update({
      where: { id: acct.id },
      data: {
        accessTokenCipher: encryptSecret(refreshed.accessToken),
        refreshTokenCipher: encryptSecret(refreshed.refreshToken),
        tokenExpiresAt: refreshed.expiresAt,
        scopes: refreshed.scopes,
        lastError: null,
      },
    });
    return {
      accessToken: refreshed.accessToken,
      providerUserEmail: updated.providerUserEmail,
      provider: updated.provider,
    };
  } catch (e) {
    logger.warn("provider_account.refresh_failed", {
      providerAccountId: acct.id,
      message: (e as Error).message,
    });
    await prisma.providerAccount
      .update({
        where: { id: acct.id },
        data: { status: "error", lastError: (e as Error).message.slice(0, 500) },
      })
      .catch(() => {});
    throw new HttpError(
      401,
      "token_refresh_failed",
      "Your Gmail connection expired. Reconnect on the Settings page.",
    );
  }
}
