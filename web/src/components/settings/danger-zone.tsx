"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

/**
 * Data export + account deletion. Both operations use the same confirm-modal
 * pattern so deleting your account never happens on a stray click.
 */
export function DangerZone() {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  function deleteAccount() {
    startDelete(async () => {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) return;
      await signOut({ redirect: false });
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div>
          <div className="font-medium">Download a copy of my data</div>
          <p className="text-xs text-muted-foreground">
            JSON export of your profile, projects, recipients, and drafts.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/account/export">Download</a>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <div>
          <div className="font-medium text-destructive">Delete my account</div>
          <p className="text-xs text-muted-foreground">
            Revokes every connected inbox and purges all data within 30 days.
            This cannot be undone.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmOpen(true)}
        >
          Delete account…
        </Button>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-destructive">
              This will permanently delete your account
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Type <code>delete</code> below to confirm.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="delete"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={typed !== "delete" || deleting}
                onClick={deleteAccount}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
