"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Briefing } from "@/lib/llm/schemas";
import type { RecipientView } from "./types";

/**
 * Bottom action bar:
 *   - Generate AI drafts — LLM text only in our DB
 *   - Save to Gmail Drafts — approved rows only → Gmail drafts.create
 *   - Send all now — drafted or approved rows → Gmail messages.send (real send)
 */
export function CampaignActionBar({
  projectId,
  status,
  briefing,
  recipients,
  setRecipients,
  providers,
  providerAccountId,
  setProviderAccountId,
}: {
  projectId: string;
  status: string;
  briefing: Briefing | null;
  recipients: RecipientView[];
  setRecipients: React.Dispatch<React.SetStateAction<RecipientView[]>>;
  providers: { id: string; providerUserEmail: string; provider: string }[];
  providerAccountId: string | null;
  setProviderAccountId: (id: string | null) => void;
}) {
  // Spell out the gate reason in English so the UI can show it next to the
  // disabled button instead of leaving the user to guess.
  const generateBlockedReason = useMemo<string | null>(() => {
    if (!briefing)
      return "Finish the briefing first (info briefing chat, or fill the briefing summary manually).";
    if (recipients.length === 0) return "Add at least one recipient in the right panel.";
    return null;
  }, [briefing, recipients.length]);
  const readyToGenerate = generateBlockedReason === null;
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [pushPending, startPush] = useTransition();
  const [sendPending, startSend] = useTransition();
  const [confirmPush, setConfirmPush] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Rows that can be saved as Gmail drafts (no Approve required). */
  const pushableCount = useMemo(
    () =>
      recipients.filter(
        (r) =>
          (r.status === "drafted" || r.status === "approved") &&
          Boolean(r.email?.trim()) &&
          Boolean(r.subject?.trim()) &&
          Boolean(r.body?.trim()),
      ).length,
    [recipients],
  );
  const draftedCount = useMemo(
    () =>
      recipients.filter(
        (r) =>
          r.status === "drafted" ||
          r.status === "approved" ||
          r.status === "pushed",
      ).length,
    [recipients],
  );

  const sendableCount = useMemo(
    () =>
      recipients.filter(
        (r) =>
          (r.status === "drafted" ||
            r.status === "approved" ||
            r.status === "pushed") &&
          Boolean(r.email?.trim()) &&
          Boolean(r.subject?.trim()) &&
          Boolean(r.body?.trim()),
      ).length,
    [recipients],
  );

  async function generate() {
    if (!readyToGenerate) return;
    setErr(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/campaigns/${projectId}/generate`, {
        method: "POST",
      });
      if (!res.ok) {
        const { message } = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setErr(message ?? "Draft generation failed.");
        return;
      }
      const { recipients: updated } = (await res.json()) as {
        recipients: RecipientView[];
      };
      setRecipients(updated);
    } finally {
      setGenerating(false);
    }
  }

  async function push() {
    setErr(null);
    startPush(async () => {
      const res = await fetch(`/api/campaigns/${projectId}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAccountId }),
      });
      if (!res.ok) {
        const { message } = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setErr(message ?? "Could not save drafts to Gmail.");
        return;
      }
      const { recipients: updated } = (await res.json()) as {
        recipients: RecipientView[];
      };
      setRecipients(updated);
      setConfirmPush(false);
      router.refresh();
    });
  }

  async function sendAll() {
    setErr(null);
    startSend(async () => {
      const res = await fetch(`/api/campaigns/${projectId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAccountId }),
      });
      if (!res.ok) {
        const { message } = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setErr(message ?? "Send failed.");
        return;
      }
      const { recipients: updated } = (await res.json()) as {
        recipients: RecipientView[];
      };
      setRecipients(updated);
      setConfirmSend(false);
      router.refresh();
    });
  }

  const connectedEmail =
    providers.find((p) => p.id === providerAccountId)?.providerUserEmail ??
    null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Send from:</span>
          {providers.length === 0 ? (
            <a href="/settings" className="text-accent-foreground underline">
              Connect a Gmail account →
            </a>
          ) : (
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={providerAccountId ?? ""}
              onChange={(e) => setProviderAccountId(e.target.value || null)}
            >
              <option value="">— pick one —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.providerUserEmail}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-muted-foreground">
            · Run status: <b>{status}</b>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex flex-col items-end"
            title={generateBlockedReason ?? undefined}
          >
            <Button
              variant={readyToGenerate ? "accent" : "outline"}
              disabled={!readyToGenerate || generating}
              onClick={generate}
              title="Writes subject + body here with AI. Does not touch Gmail until you use the other button."
            >
              {generating ? "Writing drafts…" : "Generate AI drafts"}
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={
              pushableCount === 0 ||
              !providerAccountId ||
              pushPending ||
              sendPending
            }
            onClick={() => setConfirmPush(true)}
            title={
              pushableCount === 0
                ? "Need drafted rows with email, subject, and body (Approve optional)."
                : !providerAccountId
                  ? "Connect a Gmail account in Settings."
                  : "Creates real drafts in Gmail’s Drafts folder. You still send from Gmail yourself."
            }
          >
            Save {pushableCount} to Gmail Drafts
          </Button>
          <Button
            variant="destructive"
            disabled={
              sendableCount === 0 ||
              !providerAccountId ||
              sendPending ||
              pushPending
            }
            onClick={() => setConfirmSend(true)}
            title={
              sendableCount === 0
                ? "Need at least one drafted row with email, subject, and body."
                : !providerAccountId
                  ? "Connect a Gmail account in Settings."
                  : "Emails every drafted or approved row immediately. No Approve required."
            }
          >
            Send all ({sendableCount}) now
          </Button>
        </div>
        {err && (
          <div className="basis-full rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {err}
          </div>
        )}
        {generateBlockedReason && (
          <p className="basis-full text-xs text-muted-foreground">
            <b>Can&apos;t generate yet:</b> {generateBlockedReason}
          </p>
        )}
        {!generateBlockedReason && draftedCount > 0 && pushableCount === 0 && (
          <p className="basis-full text-xs text-muted-foreground">
            Tip: finish filling email / subject / body for each row, or use{" "}
            <b>Generate AI drafts</b>. <b>Approve</b> is optional for both Save and Send.
          </p>
        )}
        {!generateBlockedReason && providers.length === 0 && (
          <p className="basis-full text-xs text-muted-foreground">
            You can generate and review drafts here anytime. Saving them into Gmail needs a connected account (<a href="/settings" className="underline">Settings</a>).
          </p>
        )}
      </CardContent>
      {confirmPush && (
        <ConfirmPushModal
          email={connectedEmail ?? "your account"}
          count={pushableCount}
          pending={pushPending}
          onCancel={() => setConfirmPush(false)}
          onConfirm={push}
        />
      )}
      {confirmSend && (
        <ConfirmSendModal
          email={connectedEmail ?? "your account"}
          count={sendableCount}
          pending={sendPending}
          onCancel={() => setConfirmSend(false)}
          onConfirm={sendAll}
        />
      )}
    </Card>
  );
}

function ConfirmSendModal({
  email,
  count,
  pending,
  onCancel,
  onConfirm,
}: {
  email: string;
  count: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-destructive">Send email now?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This will send <b>{count}</b> real message{count === 1 ? "" : "s"} from{" "}
          <b>{email}</b> to each recipient&apos;s address using the subject + body
          shown in Coldbrew (including any edits you made). This is{" "}
          <b>not</b> a draft — recipients can receive it immediately.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Sending…" : "Yes, send all now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmPushModal({
  email,
  count,
  pending,
  onCancel,
  onConfirm,
}: {
  email: string;
  count: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Save drafts to Gmail?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This creates{" "}
          <b>
            {count} draft{count === 1 ? "" : "s"}
          </b>{" "}
          in the <b>Drafts</b> folder of <b>{email}</b> from every{" "}
          <b>drafted</b> or <b>approved</b> row (Approve is optional). Nothing is
          sent to recipients yet — you open Gmail and hit <b>Send</b> when you are
          ready.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="accent" onClick={onConfirm} disabled={pending}>
            {pending ? "Saving to Gmail…" : "Yes, save to Gmail Drafts"}
          </Button>
        </div>
      </div>
    </div>
  );
}
