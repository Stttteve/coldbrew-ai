"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

const FALLBACK_APP_URL = "https://your-vercel-project.vercel.app";

function gmailConnectErrorMessage(code: string, appOrigin: string): string {
  const gmailRedirectUri = `${appOrigin}/api/oauth/google/callback`;

  switch (code) {
    case "redirect_uri_mismatch":
      return (
        "Google rejected the redirect URL. In Google Cloud Console, open the OAuth client used for " +
        "Gmail (GMAIL_OAUTH_CLIENT_ID) and add this exact Authorized redirect URI: " +
        `${gmailRedirectUri}. It must match GMAIL_OAUTH_REDIRECT_URI in your deployment environment.`
      );
    case "invalid_client_secret":
      return (
        "Client ID or client secret for the Gmail OAuth client is wrong. Check GMAIL_OAUTH_CLIENT_ID " +
        "and GMAIL_OAUTH_CLIENT_SECRET in .env.local — they must belong to the same Web client that has the Gmail callback URI."
      );
    case "invalid_grant_retry":
      return (
        "The authorization code was rejected (often expired or already used). Click Connect Gmail again. " +
        "If it keeps happening, revoke Coldbrew access at myaccount.google.com/permissions and retry."
      );
    case "missing_refresh_token":
      return (
        "Google did not return a long-lived refresh token. Remove the app from your Google Account " +
        "permissions, then connect again so Google can issue a new refresh token."
      );
    case "session_expired":
      return "The connect flow took too long. Click Connect Gmail again.";
    case "state_mismatch":
      return "Security check failed. Click Connect Gmail again and complete the flow in one browser.";
    case "user_mismatch":
      return "Signed-in user changed during the flow. Stay logged into Coldbrew, then try again.";
    default:
      return `${code.replace(/_/g, " ")} — check the server log for details, or try again.`;
  }
}

interface ProviderAccountView {
  id: string;
  provider: string;
  providerUserEmail: string;
  scopes: string[];
  status: string;
  tokenExpiresAt: Date | string;
  createdAt: Date | string;
}

export function ConnectGmailSection({
  accounts,
  connectedEmail,
  errorCode,
}: {
  accounts: ProviderAccountView[];
  connectedEmail?: string;
  errorCode?: string;
}) {
  const router = useRouter();
  const appOrigin =
    typeof window === "undefined" ? FALLBACK_APP_URL : window.location.origin;
  const [pending, startTransition] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);

  async function disconnect(id: string) {
    setClientError(null);
    startTransition(async () => {
      const res = await fetch("/api/oauth/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAccountId: id }),
      });
      if (!res.ok) {
        setClientError("Could not disconnect. Please try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {connectedEmail && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Connected: <b>{connectedEmail}</b>
        </div>
      )}
      {errorCode && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">Could not connect Gmail</p>
          <p className="mt-1 text-destructive/90">
            {gmailConnectErrorMessage(errorCode, appOrigin)}
          </p>
        </div>
      )}
      {clientError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {clientError}
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No inbox connected yet.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="space-y-0.5">
                <div className="font-medium">{a.providerUserEmail}</div>
                <div className="text-xs text-muted-foreground">
                  Gmail · scopes: {a.scopes.join(", ") || "—"} ·{" "}
                  <span
                    className={
                      a.status === "active"
                        ? "text-emerald-700"
                        : "text-destructive"
                    }
                  >
                    {a.status}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => disconnect(a.id)}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button asChild variant="accent">
        <a href="/api/oauth/google/start">
          {accounts.length ? "Connect another Gmail" : "Connect Gmail"}
        </a>
      </Button>
    </div>
  );
}
