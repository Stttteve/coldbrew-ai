"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PURPOSE_CATEGORIES,
  PURPOSE_LABEL,
  PURPOSE_LENGTH,
  type Briefing,
} from "@/lib/llm/schemas";

/**
 * Sensible starter briefing used when the AI interviewer hasn't produced
 * one yet. Lets the user skip the chat entirely and fill it in manually.
 */
const DEFAULT_BRIEFING: Briefing = {
  purpose_category: "general_inquiry",
  sender_role: "",
  specific_ask: "",
  tone: "semi_formal",
  length_target: PURPOSE_LENGTH.general_inquiry[0],
  must_mention: [],
};

/**
 * Editable briefing summary (structured fields).
 *
 * Shown in two modes:
 *   - `briefing` prop is non-null: pre-filled from the info briefing or manual entry.
 *   - `briefing` is null: starts empty with sensible defaults. Saving the first time
 *     unlocks “Generate AI drafts”. Escape hatch when the interviewer can't emit JSON.
 */
export function BriefingSummary({
  projectId,
  briefing,
  onChange,
}: {
  projectId: string;
  briefing: Briefing | null;
  onChange: (b: Briefing) => void;
}) {
  const isNew = briefing === null;
  const [b, setB] = useState<Briefing>(briefing ?? DEFAULT_BRIEFING);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(isNew);
  const [err, setErr] = useState<string | null>(null);

  function patch(partial: Partial<Briefing>) {
    setB((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }

  function save() {
    if (!b.sender_role.trim() || !b.specific_ask.trim()) {
      setErr("Sender role and Specific ask are required.");
      return;
    }
    setErr(null);
    const briefing: Briefing = {
      ...b,
      sender_intro: b.sender_intro?.trim() || undefined,
    };
    startTransition(async () => {
      const res = await fetch(`/api/campaigns/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing }),
      });
      if (!res.ok) {
        setErr("Couldn't save. Check your inputs.");
        return;
      }
      setDirty(false);
      setB(briefing);
      onChange(briefing);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Briefing summary {isNew ? "— not set yet" : ""}
        </CardTitle>
        {isNew && (
          <CardDescription>
            Either finish the info briefing on the left, or fill this in
            manually. <b>Sender role</b> and <b>Specific ask</b> are required
            before you can generate drafts. Both this form and the info briefing
            feed the draft writer.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Field label="Purpose">
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={b.purpose_category}
            onChange={(e) =>
              patch({
                purpose_category: e.target
                  .value as Briefing["purpose_category"],
              })
            }
          >
            {PURPOSE_CATEGORIES.map((k) => (
              <option key={k} value={k}>
                {PURPOSE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sender role">
          <Input
            value={b.sender_role}
            onChange={(e) => patch({ sender_role: e.target.value })}
          />
        </Field>
        <Field label="Sender intro (optional)">
          <textarea
            className="min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="A few sentences about you (background, school, goals). The model may weave 1–2 relevant points into each email."
            value={b.sender_intro ?? ""}
            onChange={(e) =>
              patch({
                sender_intro: e.target.value ? e.target.value : undefined,
              })
            }
          />
        </Field>
        <Field label="Specific ask">
          <Input
            value={b.specific_ask}
            onChange={(e) => patch({ specific_ask: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tone">
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={b.tone}
              onChange={(e) =>
                patch({ tone: e.target.value as Briefing["tone"] })
              }
            >
              <option value="formal">formal</option>
              <option value="semi_formal">semi-formal</option>
              <option value="casual">casual</option>
            </select>
          </Field>
          <Field label="Length (words)">
            <Input
              type="number"
              min={40}
              max={400}
              value={b.length_target}
              onChange={(e) =>
                patch({ length_target: parseInt(e.target.value, 10) || 0 })
              }
            />
          </Field>
        </div>
        <Field label="Must mention (one per line)">
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={b.must_mention.join("\n")}
            onChange={(e) =>
              patch({
                must_mention: e.target.value
                  .split(/\n+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
          <Button
            size="sm"
            variant="accent"
            disabled={!dirty || pending}
            onClick={save}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
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
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
