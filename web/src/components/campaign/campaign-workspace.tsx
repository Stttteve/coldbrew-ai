"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BriefingChat } from "./briefing-chat";
import { BriefingSummary } from "./briefing-summary";
import { RecipientPanel } from "./recipient-panel";
import { CampaignActionBar } from "./campaign-action-bar";
import type { Briefing } from "@/lib/llm/schemas";
import type { RecipientView } from "./types";

interface Props {
  project: {
    id: string;
    name: string;
    status: string;
    briefing: Briefing | null;
    sendingProviderAccountId: string | null;
    attachResume: boolean;
  };
  /** Gmail signature from Settings — shown with draft preview (not stored in body). */
  defaultSignature: string | null;
  /** User has uploaded a resume in Settings (PDF/Word). */
  hasResume: boolean;
  providers: { id: string; providerUserEmail: string; provider: string }[];
  recipients: RecipientView[];
}

export function CampaignWorkspace({
  project,
  defaultSignature,
  hasResume,
  providers,
  recipients: initialRecipients,
}: Props) {
  const router = useRouter();
  const [briefing, setBriefing] = useState<Briefing | null>(project.briefing);
  const [recipients, setRecipients] = useState<RecipientView[]>(initialRecipients);
  const [attachResume, setAttachResume] = useState(project.attachResume);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [attachPending, startAttach] = useTransition();

  useEffect(() => {
    setAttachResume(project.attachResume);
  }, [project.attachResume]);
  const [providerAccountId, setProviderAccountId] = useState<string | null>(
    project.sendingProviderAccountId ??
      (providers.length === 1 ? providers[0].id : null),
  );

  function patchAttachResume(next: boolean) {
    setAttachErr(null);
    setAttachResume(next);
    startAttach(async () => {
      const res = await fetch(`/api/campaigns/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachResume: next }),
      });
      if (!res.ok) {
        setAttachErr("Could not save option.");
        setAttachResume(!next);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/80 bg-muted/30 px-4 py-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={attachResume}
            disabled={attachPending}
            onChange={(e) => patchAttachResume(e.target.checked)}
          />
          Attach resume to Gmail drafts &amp; sends
        </label>
        {!hasResume && attachResume ? (
          <span className="text-amber-800">
            Upload a resume in{" "}
            <a href="/settings" className="underline font-medium">
              Settings
            </a>{" "}
            first.
          </span>
        ) : null}
        {attachErr ? <span className="text-destructive">{attachErr}</span> : null}
      </div>

      <div className="relative lg:min-h-0">
        <div className="space-y-4 lg:mr-[calc(50%+0.5rem)]">
          <BriefingChat
            projectId={project.id}
            initialBriefing={briefing}
            onBriefingExtracted={setBriefing}
          />
          <BriefingSummary
            projectId={project.id}
            briefing={briefing}
            onChange={setBriefing}
          />
        </div>

        <div className="mt-4 flex min-h-0 w-full flex-col overflow-hidden lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:w-[calc(50%-0.5rem)]">
          <RecipientPanel
            projectId={project.id}
            defaultSignature={defaultSignature}
            recipients={recipients}
            setRecipients={setRecipients}
            providerAccountId={providerAccountId}
          />
        </div>
      </div>

      <CampaignActionBar
        projectId={project.id}
        status={project.status}
        briefing={briefing}
        recipients={recipients}
        setRecipients={setRecipients}
        providers={providers}
        providerAccountId={providerAccountId}
        setProviderAccountId={setProviderAccountId}
      />
    </div>
  );
}
