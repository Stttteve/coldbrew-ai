"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setName("");
  }

  function create() {
    const trimmed = name.trim();
    startTransition(async () => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trimmed ? { name: trimmed } : {}),
      });
      if (!res.ok) return;
      const { project } = (await res.json()) as { project: { id: string } };
      close();
      router.push(`/campaigns/${project.id}`);
    });
  }

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)} disabled={pending}>
        {pending ? "Creating…" : "New project"}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close dialog"
            onClick={close}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-4 shadow-lg">
            <h2 className="text-lg font-semibold">New project</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional: give it a name now, or leave blank for &quot;Untitled project&quot;. You can
              edit the name in this box any time before you click Create — after that, use Rename
              on the list or project page.
            </p>
            <div className="mt-4 space-y-2">
              <Label htmlFor="new-project-name">Project name</Label>
              <Input
                id="new-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q2 investor outreach"
                disabled={pending}
                maxLength={120}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") close();
                }}
                autoFocus
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" variant="accent" onClick={create} disabled={pending}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
