import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { gmailProvider } from "@/lib/providers/gmail";
import { consumeOAuthSession } from "@/lib/oauth-session";
import { logger } from "@/lib/logger";

/**
 * GET /api/oauth/google/callback
 *
 * Handles the redirect from Google after the user grants (or denies) consent.
 *
 * Security checks, in order:
 *   1. Drop any response that lacks a state param (malformed / CSRF probe).
 *   2. Pop the expected state + PKCE verifier from our cookie session.
 *   3. Ensure the state matches exactly.
 *   4. Ensure the user still has a valid app session (signup could have
 *      happened in another tab — we don't trust the cookie alone).
 *   5. Exchange the code with PKCE verifier.
 *   6. Encrypt both tokens with envelope encryption BEFORE they hit the DB.
 */
function errorRedirect(msg: string, requestUrl: string) {
  const url = new URL("/settings", requestUrl);
  url.searchParams.set("gmail_connect_error", msg);
  return NextResponse.redirect(url);
}

/** Map server-side exchange errors to a short URL-safe code + optional hint for Settings UI. */
function classifyExchangeError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("redirect_uri_mismatch")) return "redirect_uri_mismatch";
  if (m.includes("invalid_client")) return "invalid_client_secret";
  if (m.includes("invalid_grant")) return "invalid_grant_retry";
  if (m.includes("refresh_token")) return "missing_refresh_token";
  return "exchange_failed";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError) {
    logger.warn("gmail_oauth.callback.provider_error", { error: providerError });
    return errorRedirect(providerError, req.url);
  }
  if (!code || !state) return errorRedirect("missing_code_or_state", req.url);

  const stored = await consumeOAuthSession();
  if (!stored) return errorRedirect("session_expired", req.url);
  if (stored.state !== state) return errorRedirect("state_mismatch", req.url);

  const session = await auth();
  if (!session?.user?.id || session.user.id !== stored.userId) {
    return errorRedirect("user_mismatch", req.url);
  }

  let result: Awaited<ReturnType<typeof gmailProvider.exchangeCode>>;
  try {
    const redirectUri = new URL("/api/oauth/google/callback", req.url).toString();
    result = await gmailProvider.exchangeCode(
      code,
      stored.codeVerifier,
      redirectUri,
    );
  } catch (e) {
    const message = (e as Error).message;
    logger.error("gmail_oauth.callback.exchange_failed", { message });
    return errorRedirect(classifyExchangeError(message), req.url);
  }

  const { tokens, email } = result;
  const accessTokenCipher = encryptSecret(tokens.accessToken);
  const refreshTokenCipher = encryptSecret(tokens.refreshToken);

  try {
    await prisma.providerAccount.upsert({
      where: {
        userId_provider_providerUserEmail: {
          userId: stored.userId,
          provider: "google",
          providerUserEmail: email.toLowerCase(),
        },
      },
      create: {
        userId: stored.userId,
        provider: "google",
        providerUserEmail: email.toLowerCase(),
        accessTokenCipher,
        refreshTokenCipher,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: "active",
      },
      update: {
        accessTokenCipher,
        refreshTokenCipher,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: "active",
        lastError: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: stored.userId,
        action: "connect_provider",
        metadata: { provider: "google", email: email.toLowerCase() },
      },
    });
  } catch (e) {
    logger.error("gmail_oauth.callback.db_write_failed", {
      message: (e as Error).message,
    });
    return errorRedirect("db_write_failed", req.url);
  }

  const successUrl = new URL("/settings", req.url);
  successUrl.searchParams.set("gmail_connected", email.toLowerCase());
  return NextResponse.redirect(successUrl);
}
