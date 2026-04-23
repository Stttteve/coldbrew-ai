"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectNameHeader({
  projectId,
  initialName,
}: {
  projectId: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setName(initialName);
    setDraft(initialName);
  }, [initialName]);

  async function save() {
    const trimmed = draft.trim();
    setErr(null);
    if (!trimmed) {
      setErr("Name cannot be empty.");
      return;
    }
    if (trimmed === name) {
      setEdit(false);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/campaigns/${projectId}`, {
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
      setEdit(false);
    } finally {
      setPending(false);
    }
  }

  if (!edit) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => {
            setDraft(name);
            setErr(null);
            setEdit(true);
          }}
        >
          Rename
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="max-w-xl text-xl font-semibold tracking-tight sm:text-2xl"
          placeholder="Project name"
          disabled={pending}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setDraft(name);
              setEdit(false);
              setErr(null);
            }
          }}
        />
        <Button type="button" size="sm" variant="accent" disabled={pending} onClick={() => void save()}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setDraft(name);
            setEdit(false);
            setErr(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
