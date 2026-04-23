import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  buildAuthUrl,
  generatePkcePair,
  generateState,
} from "@/lib/providers/google-oauth";
import { createOAuthSession } from "@/lib/oauth-session";
import { logger } from "@/lib/logger";

/**
 * GET /api/oauth/google/start
 *
 * Initiates the Gmail provider OAuth flow. Requires the user to already be
 * signed in to Coldbrew — otherwise we have no User to attach the grant to.
 *
 * We:
 *   1. Mint a fresh `state` + PKCE verifier/challenge.
 *   2. Stash them in an HTTP-only cookie keyed to the current user.
 *   3. Redirect the browser to Google's consent screen.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(
      new URL("/login?callbackUrl=/settings", req.url),
    );
  }

  const state = generateState();
  const { verifier, challenge } = generatePkcePair();
  const redirectUri = new URL("/api/oauth/google/callback", req.url).toString();

  await createOAuthSession({
    state,
    codeVerifier: verifier,
    userId: session.user.id,
  });

  const authUrl = buildAuthUrl({
    state,
    codeChallenge: challenge,
    redirectUri,
    loginHint: session.user.email ?? undefined,
  });

  logger.info("gmail_oauth.start", { userId: session.user.id });

  return NextResponse.redirect(authUrl);
}
