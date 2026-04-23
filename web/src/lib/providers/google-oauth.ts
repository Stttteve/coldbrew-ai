import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import type { ProviderTokens } from "./types";

/**
 * Gmail provider OAuth primitives.
 *
 * IMPORTANT: this is the *provider* OAuth (gmail.compose) — the flow that
 * authorizes the app to write drafts to the user's mailbox. It is DISTINCT
 * from the SSO login Google flow handled by Auth.js.
 *
 * Keep these primitives framework-agnostic so they can be tested directly.
 */

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.compose",
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function required<K extends keyof typeof env>(key: K): string {
  const v = env[key];
  if (!v) {
    throw new Error(
      `${key} is not configured. Set it in .env.local (see .env.example).`,
    );
  }
  return v as string;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Generate the PKCE pair we'll use for this authorization. */
export function generatePkcePair() {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(
    createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

/** Generate an opaque random state token for CSRF protection. */
export function generateState(): string {
  return base64UrlEncode(randomBytes(24));
}

/** Build the Google authorization URL the browser should redirect to. */
export function buildAuthUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  loginHint?: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", required("GMAIL_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // force refresh_token on every consent
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

/** Exchange an authorization code for tokens, enforcing PKCE. */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ tokens: ProviderTokens; email: string }> {
  const body = new URLSearchParams({
    code,
    client_id: required("GMAIL_OAUTH_CLIENT_ID"),
    client_secret: required("GMAIL_OAUTH_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `Google token exchange failed (${res.status}): ${await res.text()}`,
    );
  }
  const data = (await res.json()) as GoogleTokenResponse;

  if (!data.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. This usually means the user " +
        "has already granted consent — revoke prior grants at myaccount.google.com/permissions " +
        "or force prompt=consent (already set).",
    );
  }

  const emailRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  if (!emailRes.ok) {
    throw new Error(`userinfo fetch failed (${emailRes.status})`);
  }
  const { email } = (await emailRes.json()) as { email: string };

  return {
    email,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: data.scope.split(" "),
    },
  };
}

/** Refresh an access token. Google may omit refresh_token; keep the old one. */
export async function refreshTokens(
  refreshToken: string,
): Promise<ProviderTokens> {
  const body = new URLSearchParams({
    client_id: required("GMAIL_OAUTH_CLIENT_ID"),
    client_secret: required("GMAIL_OAUTH_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as GoogleTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: data.scope.split(" "),
  };
}

/** Revoke a token. Pass the refresh token so the whole grant is torn down. */
export async function revokeToken(refreshToken: string): Promise<void> {
  const body = new URLSearchParams({ token: refreshToken });
  const res = await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok && res.status !== 400) {
    // 400 = token already invalid, which is what we wanted anyway
    throw new Error(`Google revoke failed (${res.status}): ${await res.text()}`);
  }
}
