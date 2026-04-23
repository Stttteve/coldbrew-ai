"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CampaignListItem = {
  id: string;
  name: string;
  status: string;
  purposeCategory: string | null;
  recipientCount: number;
};

function ProjectListRow({ initial }: { initial: CampaignListItem }) {
  const [name, setName] = useState(initial.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.name);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const trimmed = draft.trim();
    setErr(null);
    if (!trimmed) {
      setErr("Name cannot be empty.");
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/campaigns/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        setErr("Could not save. Try a shorter name.");
        return;
      }
      const { project } = (await res.json()) as { project: { name: string } };
      setName(project.name);
      setDraft(project.name);
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setDraft(name);
    setEditing(false);
    setErr(null);
  }

  return (
    <li>
      <div className="flex flex-col gap-2 px-5 py-4 hover:bg-amber-50/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="max-w-md"
              placeholder="Project name"
              disabled={pending}
              maxLength={120}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") cancel();
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="accent" disabled={pending} onClick={() => void save()}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={cancel}>
                Cancel
              </Button>
            </div>
            {err ? <p className="w-full text-sm text-destructive">{err}</p> : null}
          </div>
        ) : (
          <>
            <Link
              href={`/campaigns/${initial.id}`}
              className="min-w-0 flex-1 space-y-0.5 rounded-md outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="font-medium">{name}</div>
              <div className="text-xs text-muted-foreground">
                {initial.recipientCount} recipient{initial.recipientCount === 1 ? "" : "s"} ·{" "}
                <span className="uppercase tracking-wide">{initial.status}</span>
                {initial.purposeCategory
                  ? ` · ${initial.purposeCategory.replace(/_/g, " ")}`
                  : ""}
              </div>
            </Link>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(name);
                  setErr(null);
                  setEditing(true);
                }}
              >
                Rename
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/campaigns/${initial.id}`}>Open →</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export function CampaignsList({ campaigns }: { campaigns: CampaignListItem[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-white">
      {campaigns.map((c) => (
        <ProjectListRow key={c.id} initial={c} />
      ))}
    </ul>
  );
}
