"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecipientCard } from "./recipient-card";
import type { RecipientView } from "./types";

/**
 * Recipient management panel — three ways to add:
 *   1. Paste a list (one per line: email, Name <email>, or any https profile URL)
 *   2. CSV upload
 *   3. Manual single add
 *
 * We parse client-side for instant feedback, then POST the normalised rows
 * to the server which re-validates and kicks off enrichment jobs.
 */
export function RecipientPanel({
  projectId,
  defaultSignature,
  recipients,
  setRecipients,
  providerAccountId,
}: {
  projectId: string;
  defaultSignature: string | null;
  recipients: RecipientView[];
  setRecipients: React.Dispatch<React.SetStateAction<RecipientView[]>>;
  /** Connected Gmail used for per-recipient Send. */
  providerAccountId: string | null;
}) {
  const [mode, setMode] = useState<"paste" | "csv" | "manual">("paste");
  const [pasteText, setPasteText] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualLinkedin, setManualLinkedin] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const s = {
      total: recipients.length,
      enriched: 0,
      drafted: 0,
      sent: 0,
      error: 0,
    };
    for (const r of recipients) {
      if (
        r.status === "enriched" ||
        r.status === "drafted" ||
        r.status === "approved" ||
        r.status === "pushed" ||
        r.status === "sent"
      )
        s.enriched++;
      if (r.status === "drafted" || r.status === "approved" || r.status === "pushed")
        s.drafted++;
      if (r.status === "sent") s.sent++;
      if (r.status === "error") s.error++;
    }
    return s;
  }, [recipients]);

  async function addFromPaste() {
    if (!pasteText.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/campaigns/${projectId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "paste", text: pasteText }),
      });
      if (!res.ok) {
        setError("Couldn't parse recipients.");
        return;
      }
      const { recipients: added } = (await res.json()) as {
        recipients: RecipientView[];
      };
      setRecipients((prev) => mergeRecipients(prev, added));
      setPasteText("");
    });
  }

  async function addManual() {
    if (!manualEmail && !manualName && !manualLinkedin) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/campaigns/${projectId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          recipients: [
            {
              email: manualEmail || undefined,
              name: manualName || undefined,
              linkedinUrl: manualLinkedin || undefined,
            },
          ],
        }),
      });
      if (!res.ok) {
        setError("Invalid recipient.");
        return;
      }
      const { recipients: added } = (await res.json()) as {
        recipients: RecipientView[];
      };
      setRecipients((prev) => mergeRecipients(prev, added));
      setManualEmail("");
      setManualName("");
      setManualLinkedin("");
    });
  }

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 1024 * 1024) {
      setError("File too large (1 MB max).");
      return;
    }
    const text = await file.text();
    startTransition(async () => {
      const res = await fetch(`/api/campaigns/${projectId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "csv", text }),
      });
      if (!res.ok) {
        const { error: msg } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(msg ?? "CSV parse failed.");
        return;
      }
      const { recipients: added } = (await res.json()) as {
        recipients: RecipientView[];
      };
      setRecipients((prev) => mergeRecipients(prev, added));
      e.target.value = "";
    });
  }

  async function remove(id: string) {
    const res = await fetch(
      `/api/campaigns/${projectId}/recipients/${id}`,
      { method: "DELETE" },
    );
    if (res.ok) setRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  async function patch(id: string, body: Partial<RecipientView>) {
    const res = await fetch(`/api/campaigns/${projectId}/recipients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const { recipient } = (await res.json()) as { recipient: RecipientView };
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? recipient : r)),
    );
  }

  function replaceRecipient(updated: RecipientView) {
    setRecipients((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r)),
    );
  }

  return (
    <Card className="flex min-h-0 w-full flex-col lg:h-full lg:flex-1">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-lg">
          Recipients ({stats.total})
        </CardTitle>
        <div className="flex gap-1 text-xs">
          <Pill tone="muted">{stats.total} total</Pill>
          <Pill tone="ok">{stats.enriched} enriched</Pill>
          <Pill tone="ok">{stats.drafted} drafted</Pill>
          {stats.sent > 0 && (
            <Pill tone="ok">{stats.sent} sent</Pill>
          )}
          {stats.error > 0 && (
            <Pill tone="err">{stats.error} error{stats.error > 1 ? "s" : ""}</Pill>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex rounded-md border bg-muted/60 p-0.5 text-sm">
          {(["paste", "csv", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded px-2 py-1 capitalize ${mode === m ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === "paste" && (
          <div className="space-y-2">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Paste one per line — any of:\n  professor@berkeley.edu\n  Jane Doe <jane@acme.com>\n  https://linkedin.com/in/janedoe\n  https://faculty.example.edu/~jdoe\n  Just a name`}
              className="min-h-[160px] h-44 w-full resize-y rounded-md border bg-background px-3 py-2.5 font-mono text-sm sm:min-h-[180px] sm:h-52"
            />
            <Button
              variant="accent"
              size="sm"
              disabled={pending || !pasteText.trim()}
              onClick={addFromPaste}
            >
              {pending ? "Adding…" : "Add to project"}
            </Button>
          </div>
        )}

        {mode === "csv" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Headers accepted: <code>email</code>, <code>name</code>,{" "}
              <code>title</code>, <code>organization</code>,{" "}
              <code>linkedin_url</code> / <code>profile_url</code> / <code>url</code>{" "}
              (any https page). Extra columns ignored. Up to 500 rows / 1 MB.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onCsv}
              className="text-sm"
              disabled={pending}
            />
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              />
              <input
                placeholder="Name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <input
              placeholder="Profile or LinkedIn URL (https…, optional)"
              value={manualLinkedin}
              onChange={(e) => setManualLinkedin(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
            <Button
              variant="accent"
              size="sm"
              disabled={pending}
              onClick={addManual}
            >
              Add recipient
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="-mx-2 flex-1 space-y-2 overflow-y-auto px-2">
          {recipients.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No recipients yet.
            </p>
          ) : (
            recipients.map((r) => (
              <RecipientCard
                key={r.id}
                projectId={projectId}
                recipient={r}
                defaultSignature={defaultSignature}
                providerAccountId={providerAccountId}
                onPatch={(body) => patch(r.id, body)}
                onReplaceRecipient={replaceRecipient}
                onRemove={() => remove(r.id)}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "muted" | "ok" | "err";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : tone === "err"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function mergeRecipients(
  prev: RecipientView[],
  added: RecipientView[],
): RecipientView[] {
  const byId = new Map(prev.map((r) => [r.id, r]));
  for (const r of added) byId.set(r.id, r);
  return Array.from(byId.values());
}
