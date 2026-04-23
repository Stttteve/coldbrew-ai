"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Upload / remove the user's resume (PDF or Word). Stored on disk + DB;
 * used when a project has "Attach resume" enabled.
 */
export function ResumeSection({
  initialFileName,
}: {
  initialFileName: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(initialFileName);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setFileName(initialFileName);
  }, [initialFileName]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/account/resume", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        resume?: { resumeFileName?: string | null };
        message?: string;
      };
      if (!res.ok) {
        setErr(data.message ?? "Upload failed.");
        return;
      }
      setFileName(data.resume?.resumeFileName ?? file.name);
      router.refresh();
    });
  }

  function remove() {
    setErr(null);
    start(async () => {
      const res = await fetch("/api/account/resume", { method: "DELETE" });
      if (!res.ok) {
        setErr("Could not remove resume.");
        return;
      }
      setFileName(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Resume (PDF or Word)</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          One file per account. Used only when a project enables &quot;Attach resume&quot;
          for Gmail drafts and sends (max 12 MB).
        </p>
      </div>
      {fileName ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded border bg-muted/50 px-2 py-1 font-mono text-xs">
            {fileName}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={pending}
            onClick={remove}
          >
            Remove
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          Upload resume
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onFile}
      />
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}
