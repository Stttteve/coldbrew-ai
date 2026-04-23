"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Links {
  cv?: string;
  github?: string;
  portfolio?: string;
}

/**
 * Settings → personal defaults panel. Mirrors the spec's §F1 "default
 * signature and default links" acceptance criterion.
 */
export function SignatureSection({
  initialSignature,
  initialLinks,
  initialName,
}: {
  initialSignature: string | null;
  initialLinks: Links | null;
  initialName: string | null;
}) {
  const [signature, setSignature] = useState(initialSignature ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [links, setLinks] = useState<Links>(initialLinks ?? {});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          defaultSignature: signature,
          defaultLinks: Object.keys(links).length ? links : null,
        }),
      });
      setMsg(res.ok ? "Saved." : "Could not save.");
    });
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <Label>Display name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Default signature (plain text)</Label>
        <textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={"—\nJane Doe\ngithub.com/jane"}
          className="min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <LinkField label="CV link" value={links.cv ?? ""} onChange={(v) => setLinks((p) => ({ ...p, cv: v || undefined }))} />
        <LinkField label="GitHub" value={links.github ?? ""} onChange={(v) => setLinks((p) => ({ ...p, github: v || undefined }))} />
        <LinkField label="Portfolio" value={links.portfolio ?? ""} onChange={(v) => setLinks((p) => ({ ...p, portfolio: v || undefined }))} />
      </div>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        <Button variant="accent" size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save defaults"}
        </Button>
      </div>
    </div>
  );
}

function LinkField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
      />
    </div>
  );
}
