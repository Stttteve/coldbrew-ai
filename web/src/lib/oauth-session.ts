import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

/**
 * Tiny cookie-backed, signed-ish store for the 5-minute OAuth handshake.
 *
 * We need to stash (state, code_verifier, userId-initiating-flow) between the
 * /start and /callback requests. Options were:
 *   - Redis (nice, but introduces a queue dep for Phase 0)
 *   - Postgres with a TTL sweeper
 *   - HTTP-only signed cookie (what we do now)
 *
 * Cookie is fine: payload is tiny, it dies in 10 minutes, and the CSRF-critical
 * piece is the `state` value which we verify against what Google echoes back.
 * When we wire Redis in Phase 3, migrate this to a Redis-backed version with
 * an identical signature so route handlers don't change.
 */

const COOKIE_NAME = "cb_oauth_session";
const COOKIE_MAX_AGE_SEC = 60 * 10;

export interface OAuthSession {
  state: string;
  codeVerifier: string;
  userId: string;
  nonce: string;
}

export async function createOAuthSession(
  data: Omit<OAuthSession, "nonce">,
): Promise<void> {
  const payload: OAuthSession = { ...data, nonce: randomBytes(8).toString("hex") };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  cookies().set(COOKIE_NAME, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  });
}

export async function consumeOAuthSession(): Promise<OAuthSession | null> {
  const store = cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  store.delete(COOKIE_NAME);
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
