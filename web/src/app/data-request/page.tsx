"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Public-facing data-subject request form for recipients (data subjects)
 * under GDPR / CCPA / UK-GDPR. Submits to /api/data-request. No auth needed
 * because the subject is by definition someone who does NOT have an account.
 */
export default function DataRequestPage() {
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [reason, setReason] = useState<"delete" | "access">("delete");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !linkedin) {
      setMsg("Please provide at least an email or a LinkedIn URL.");
      return;
    }
    setState("sending");
    setMsg(null);
    const res = await fetch("/api/data-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, linkedin, reason }),
    });
    if (res.ok) {
      setState("done");
    } else {
      setState("error");
      setMsg("Something went wrong. Please email privacy@example.com directly.");
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Back
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Data subject request</CardTitle>
          <CardDescription>
            Someone used Coldbrew to cold-email you? You can request deletion
            or access of any data we cached about you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "done" ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              Got it. Your request has been logged and we will action it within
              30 days as required by GDPR / CCPA.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label>Email address</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label>LinkedIn URL</Label>
                <Input
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/you"
                />
              </div>
              <div className="space-y-1">
                <Label>Request type</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as "delete" | "access")}
                >
                  <option value="delete">Delete my data</option>
                  <option value="access">Send me what you have</option>
                </select>
              </div>
              {msg && <p className="text-sm text-destructive">{msg}</p>}
              <Button type="submit" variant="accent" disabled={state === "sending"}>
                {state === "sending" ? "Submitting…" : "Submit request"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
