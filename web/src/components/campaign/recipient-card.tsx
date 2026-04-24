"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withAppendedSignature } from "@/lib/email/compose-signature";
import { withAppendedResumeMention } from "@/lib/email/resume-mention";
import { MAX_EXTRA_ATTACHMENTS_PER_RECIPIENT } from "@/lib/uploads/config";
import { recipientDraftReadiness } from "@/lib/llm/draft-readiness";
import type { RecipientView } from "./types";

/**
 * Single recipient row. Collapsed: compact summary. Expanded: full-width
 * contact grid + a large scrollable draft preview (read) or tall textarea
 * (edit) so users never miss that more content exists below the fold.
 */
export function RecipientCard({
  projectId,
  recipient,
  defaultSignature,
  providerAccountId,
  attachResume,
  hasResume,
  onPatch,
  onReplaceRecipient,
  onRemove,
}: {
  projectId: string;
  recipient: RecipientView;
  /** From User.defaultSignature — shown once after body in preview & on send (not doubled in stored body). */
  defaultSignature: string | null;
  providerAccountId: string | null;
  /** Project-level toggle: include user's resume on push/send. */
  attachResume: boolean;
  /** User has uploaded a resume in Settings. */
  hasResume: boolean;
  onPatch: (body: Partial<RecipientView>) => Promise<void> | void;
  onReplaceRecipient: (r: RecipientView) => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [sendPending, startSend] = useTransition();
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(recipient.subject ?? "");
  const [body, setBody] = useState(recipient.body ?? "");
  const [email, setEmail] = useState(recipient.email ?? "");
  const [name, setName] = useState(recipient.name ?? "");
  const [title, setTitle] = useState(recipient.title ?? "");
  const [org, setOrg] = useState(recipient.organization ?? "");
  const [profileUrl, setProfileUrl] = useState(recipient.linkedinUrl ?? "");
  const [instruction, setInstruction] = useState("");
  const [regen, setRegen] = useState(false);
  const [attachPending, setAttachPending] = useState(false);
  const [attachErr, setAttachErr] = useState<string | null>(null);

  const extras = recipient.extraAttachments ?? [];

  useEffect(() => {
    setSubject(recipient.subject ?? "");
    setBody(recipient.body ?? "");
    setEmail(recipient.email ?? "");
    setName(recipient.name ?? "");
    setTitle(recipient.title ?? "");
    setOrg(recipient.organization ?? "");
    setProfileUrl(recipient.linkedinUrl ?? "");
  }, [recipient]);

  async function saveDraft() {
    await onPatch({ subject, body });
    setEdit(false);
  }
  async function saveContact() {
    await onPatch({
      email: email || null,
      name: name || null,
      title: title || null,
      organization: org || null,
      linkedinUrl: profileUrl.trim() || null,
    });
  }

  async function regenerate() {
    setRegen(true);
    try {
      const res = await fetch(`/api/recipients/${recipient.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction || undefined }),
      });
      if (!res.ok) return;
      const { recipient: updated } = (await res.json()) as {
        recipient: RecipientView;
      };
      await onPatch(updated);
      setSubject(updated.subject ?? "");
      setBody(updated.body ?? "");
      setInstruction("");
    } finally {
      setRegen(false);
    }
  }

  const isDrafted =
    recipient.status === "drafted" ||
    recipient.status === "approved" ||
    recipient.status === "pushed" ||
    recipient.status === "sent";

  const canCollectiveOrApproveFlow =
    recipient.status === "drafted" ||
    recipient.status === "approved" ||
    recipient.status === "sent";

  const readiness = recipientDraftReadiness({
    status: recipient.status,
    body: recipient.body,
    errorReason: recipient.errorReason,
  });

  const sigTrim = defaultSignature?.trim() ?? "";
  const bodyPreviewText = withAppendedSignature(
    withAppendedResumeMention(body?.trim() ?? "", { attachResume, hasResume }),
    defaultSignature,
  );

  const canSingleSend =
    Boolean(providerAccountId) &&
    ["drafted", "approved", "pushed", "sent"].includes(recipient.status) &&
    Boolean(recipient.email?.trim()) &&
    Boolean(recipient.subject?.trim()) &&
    Boolean(recipient.body?.trim());

  function runSend() {
    if (!providerAccountId) return;
    setSendErr(null);
    startSend(async () => {
      const res = await fetch(
        `/api/campaigns/${projectId}/recipients/${recipient.id}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerAccountId }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        recipient?: RecipientView;
      };
      if (!res.ok) {
        setSendErr(data.message ?? "Send failed.");
        setConfirmSend(false);
        router.refresh();
        return;
      }
      if (data.recipient) onReplaceRecipient(data.recipient);
      setConfirmSend(false);
      router.refresh();
    });
  }

  return (
    <div className="relative rounded-xl border border-border/70 bg-white p-4 text-sm shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {readiness.mode !== "na" && (
              <span
                className="inline-flex shrink-0 items-center gap-1.5"
                title={readiness.hint}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    readiness.mode === "ready"
                      ? "bg-emerald-500"
                      : "bg-amber-400"
                  }`}
                  aria-hidden
                />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {readiness.mode === "ready"
                    ? "Ready"
                    : "Can be refined"}
                </span>
              </span>
            )}
            <span className="truncate text-base font-semibold tracking-tight">
              {recipient.name || recipient.email || "(unnamed)"}
            </span>
            <StatusChip status={recipient.status} />
            {recipient.status === "sent" ? (
              <span
                className="inline-flex shrink-0 items-center rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-900"
                title="This message was sent from your connected Gmail via Coldbrew."
              >
                Emailed
              </span>
            ) : null}
            {recipient.repliedAt ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-900"
                title={`Reply detected${recipient.lastReplyAt ? " · " + new Date(recipient.lastReplyAt).toLocaleString() : ""}`}
              >
                <span aria-hidden>↩</span> Replied
                {recipient.replyCount && recipient.replyCount > 1
                  ? ` ×${recipient.replyCount}`
                  : ""}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {recipient.email ?? "—"}
            {recipient.title ? ` · ${recipient.title}` : ""}
            {recipient.organization ? ` · ${recipient.organization}` : ""}
          </div>
          {recipient.errorReason && (
            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              {recipient.errorReason}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {canSingleSend && (
            <Button
              variant="destructive"
              size="sm"
              disabled={sendPending}
              title={
                recipient.status === "sent"
                  ? "Send another message to this recipient (will appear as a follow-up in the same Gmail thread)"
                  : "Send this one email now from your connected Gmail"
              }
              onClick={() => {
                setSendErr(null);
                setConfirmSend(true);
              }}
            >
              {recipient.status === "sent" ? "Send again" : "Send"}
            </Button>
          )}
          {recipient.deepLink && (
            <Button asChild variant="outline" size="sm">
              <a href={recipient.deepLink} target="_blank" rel="noreferrer">
                Open in Gmail
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Collapse" : "Expand"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} title="Remove">
            ×
          </Button>
        </div>
      </div>

      {sendErr && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {sendErr}
        </div>
      )}

      {confirmSend && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/35 p-3"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!sendPending) setConfirmSend(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-card p-4 shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <p className="text-sm font-medium text-destructive">Send this email now?</p>
            <p className="mt-2 text-xs text-muted-foreground">
              A real message will go from your connected inbox to{" "}
              <b>{recipient.email}</b> using the current subject and body.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={sendPending}
                onClick={() => setConfirmSend(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={sendPending}
                onClick={() => runSend()}
              >
                {sendPending ? "Sending…" : "Yes, send"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-5 space-y-6 rounded-xl border border-border/60 bg-gradient-to-b from-slate-50/95 to-slate-50/40 p-5 shadow-inner sm:p-6">
          {/* —— Contact —— */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-2">
              <h4 className="text-sm font-semibold tracking-tight text-foreground">
                Contact
              </h4>
              <span className="text-xs text-muted-foreground">
                Blur to save
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input
                  className="h-11 text-sm"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={saveContact}
                />
              </Field>
              <Field label="Name">
                <Input
                  className="h-11 text-sm"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveContact}
                />
              </Field>
              <Field label="Title">
                <Input
                  className="h-11 text-sm"
                  placeholder="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveContact}
                />
              </Field>
              <Field label="Organization">
                <Input
                  className="h-11 text-sm"
                  placeholder="Organization"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  onBlur={saveContact}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Profile / page URL (optional)">
                  <Input
                    className="h-11 font-mono text-sm"
                    placeholder="https://… (faculty page, LinkedIn, lab site)"
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    onBlur={saveContact}
                  />
                </Field>
              </div>
            </div>
          </section>

          {isDrafted ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-2">
                <h4 className="text-sm font-semibold tracking-tight text-foreground">
                  Email draft
                </h4>
                {!edit && (
                  <span className="text-xs font-medium text-amber-800/90">
                    Scroll inside the box for the full body
                  </span>
                )}
              </div>

              <Field label="Subject">
                <Input
                  className="h-11 text-base font-medium"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={!edit}
                />
              </Field>

              <Field
                label={
                  edit
                    ? "Body (drag corner to resize)"
                    : "Body preview"
                }
              >
                {edit ? (
                  <>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      spellCheck
                      className="min-h-[min(52vh,480px)] w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-[15px] leading-[1.75] shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Your{" "}
                      <Link href="/settings" className="underline">
                        Settings
                      </Link>{" "}
                      default signature is added once when you send; keep only the message here (no duplicate name block).
                    </p>
                  </>
                ) : (
                  <div className="relative rounded-lg border border-border/80 bg-white shadow-sm">
                    <div
                      className="max-h-[min(68vh,640px)] min-h-[300px] overflow-y-auto scroll-smooth px-5 py-4 text-[15px] leading-[1.75] text-foreground whitespace-pre-wrap"
                      role="article"
                      aria-label="Draft body preview"
                    >
                      {bodyPreviewText ? (
                        bodyPreviewText
                      ) : (
                        <span className="text-muted-foreground">(empty)</span>
                      )}
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-lg bg-gradient-to-t from-white via-white/80 to-transparent"
                      aria-hidden
                    />
                  </div>
                )}
                {!edit && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    If you only see a snippet, <strong className="font-medium">scroll</strong>{" "}
                    inside the white area above for the full message.
                    {sigTrim ? (
                      <>
                        {" "}
                        After a blank line: your Settings signature, shown once (same as the sent message).
                      </>
                    ) : null}
                  </p>
                )}
              </Field>

              {!edit && isDrafted && (
                <div className="rounded-lg border border-border/60 bg-white/90 px-4 py-3 text-sm">
                  <div className="font-medium text-foreground">Closing & signature</div>
                  {sigTrim ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Stored in{" "}
                      <Link href="/settings" className="font-medium underline">
                        Settings
                      </Link>
                      . The draft body should stop before this block; we append it once for preview and when saving to Gmail / sending.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No default signature in Settings — the draft ends with a short sign-off (e.g. &quot;Sincerely,&quot;) and you add your name in Gmail.{" "}
                      <Link href="/settings" className="font-medium underline">
                        Add a signature
                      </Link>{" "}
                      to show your name and links here.
                    </p>
                  )}
                  {sigTrim ? (
                    <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-[13px] leading-relaxed">
                      {sigTrim}
                    </pre>
                  ) : null}
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-white/90 px-4 py-3 text-sm">
                <div className="font-medium text-foreground">
                  Extra attachments (this recipient only)
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF or Word, up to {MAX_EXTRA_ATTACHMENTS_PER_RECIPIENT} files.
                  Included when you save drafts to Gmail or send.
                </p>
                {extras.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {extras.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5"
                      >
                        <span className="min-w-0 truncate" title={a.fileName}>
                          {a.fileName}{" "}
                          <span className="text-muted-foreground">
                            ({Math.ceil(a.size / 1024)} KB)
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs text-destructive"
                          disabled={attachPending}
                          onClick={async () => {
                            setAttachErr(null);
                            setAttachPending(true);
                            try {
                              const res = await fetch(
                                `/api/campaigns/${projectId}/recipients/${recipient.id}/attachments?attachmentId=${encodeURIComponent(a.id)}`,
                                { method: "DELETE" },
                              );
                              const data = (await res.json().catch(() => ({}))) as {
                                recipient?: RecipientView;
                              };
                              if (!res.ok || !data.recipient) {
                                setAttachErr("Remove failed.");
                                return;
                              }
                              onReplaceRecipient(data.recipient);
                            } finally {
                              setAttachPending(false);
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No extra files.</p>
                )}
                <div className="mt-2">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    disabled={
                      attachPending ||
                      extras.length >= MAX_EXTRA_ATTACHMENTS_PER_RECIPIENT
                    }
                    className="block w-full max-w-xs text-xs file:mr-2 file:rounded file:border file:bg-muted file:px-2 file:py-1"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setAttachErr(null);
                      setAttachPending(true);
                      try {
                        const fd = new FormData();
                        fd.set("file", file);
                        const res = await fetch(
                          `/api/campaigns/${projectId}/recipients/${recipient.id}/attachments`,
                          { method: "POST", body: fd },
                        );
                        const data = (await res.json().catch(() => ({}))) as {
                          recipient?: RecipientView;
                          message?: string;
                        };
                        if (!res.ok || !data.recipient) {
                          setAttachErr(
                            data.message ?? "Upload failed (type or size).",
                          );
                          return;
                        }
                        onReplaceRecipient(data.recipient);
                      } finally {
                        setAttachPending(false);
                      }
                    }}
                  />
                </div>
                {attachErr ? (
                  <p className="mt-1 text-xs text-destructive">{attachErr}</p>
                ) : null}
              </div>

              {recipient.referencedFacts.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Referenced facts: </span>
                  {recipient.referencedFacts.join(" · ")}
                </div>
              )}

              {recipient.status === "sent" && recipient.deepLink ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950">
                  <span className="font-medium">Sent from your connected Gmail.</span>{" "}
                  <a href={recipient.deepLink} className="underline" target="_blank" rel="noreferrer">
                    Open in Gmail
                  </a>
                </div>
              ) : null}

              {recipient.repliedAt ? (
                <div className="rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2.5 text-sm text-sky-950">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      Reply
                      {recipient.replyCount && recipient.replyCount > 1
                        ? ` (${recipient.replyCount} messages)`
                        : ""}
                    </span>
                    {recipient.lastReplyFrom ? (
                      <span className="truncate text-xs text-sky-900/80">
                        from {recipient.lastReplyFrom}
                      </span>
                    ) : null}
                    {recipient.lastReplyAt ? (
                      <span className="text-xs text-sky-900/70">
                        · {new Date(recipient.lastReplyAt).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  {recipient.lastReplySnippet ? (
                    <p className="line-clamp-3 text-[13px] leading-relaxed text-sky-950/90">
                      {recipient.lastReplySnippet}
                    </p>
                  ) : null}
                  {recipient.deepLink ? (
                    <a
                      href={recipient.deepLink}
                      className="mt-1 inline-block text-xs font-medium underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open thread in Gmail
                    </a>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
                {edit ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="accent" onClick={saveDraft}>
                      Save changes
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSubject(recipient.subject ?? "");
                        setBody(recipient.body ?? "");
                        setEdit(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setEdit(true)}>
                    {recipient.status === "sent" ? "Edit for follow-up" : "Edit draft"}
                  </Button>
                )}
                {canCollectiveOrApproveFlow && recipient.status !== "sent" ? (
                  <Button
                    variant={
                      recipient.status === "approved" ? "accent" : "outline"
                    }
                    onClick={() =>
                      onPatch({
                        status:
                          recipient.status === "approved"
                            ? "drafted"
                            : "approved",
                      })
                    }
                  >
                    {recipient.status === "approved" ? "Approved ✓" : "Approve"}
                  </Button>
                ) : null}
              </div>

              {canCollectiveOrApproveFlow ? (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/80 bg-white/60 p-4 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Regenerate instruction (optional)
                    </label>
                    <Input
                      placeholder="e.g. shorter, more formal, highlight one paper…"
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0 sm:mb-0"
                    disabled={regen}
                    onClick={regenerate}
                  >
                    {regen ? "Regenerating…" : "Regenerate"}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="rounded-lg border border-dashed border-muted-foreground/30 bg-white/50 px-4 py-6 text-center text-sm text-muted-foreground">
              No draft yet. Save your briefing summary on the left, then click{" "}
              <strong className="font-medium text-foreground">Generate AI drafts</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const STATUS_LABEL: Record<RecipientView["status"], string> = {
  pending: "Pending",
  enriching: "Enriching",
  enriched: "Enriched",
  drafting: "Drafting",
  drafted: "Drafted",
  approved: "Approved",
  pushed: "In Gmail (draft)",
  sent: "Sent",
  error: "Error",
};

function StatusChip({ status }: { status: RecipientView["status"] }) {
  const cls: Record<RecipientView["status"], string> = {
    pending: "bg-muted text-muted-foreground",
    enriching: "bg-amber-100 text-amber-900",
    enriched: "bg-sky-100 text-sky-900",
    drafting: "bg-amber-100 text-amber-900",
    drafted: "bg-emerald-100 text-emerald-900",
    approved: "bg-emerald-600 text-white",
    pushed: "bg-slate-900 text-white",
    sent: "bg-violet-700 text-white",
    error: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
