import { findPlaceholderSnippetsInBody } from "./validators";

export type RecipientReadinessInput = {
  status: string;
  body?: string | null;
  errorReason?: string | null;
};

/**
 * UI + light heuristics: is this draft "ready" or still worth refining?
 * (Does not re-run full validateDraft — uses persisted body + errorReason.)
 */
export function recipientDraftReadiness(
  recipient: RecipientReadinessInput,
): { mode: "na" | "ready" | "refine"; hint: string } {
  const { status, body, errorReason } = recipient;
  if (
    status !== "drafted" &&
    status !== "approved" &&
    status !== "pushed"
  ) {
    return { mode: "na", hint: "" };
  }

  const text = body ?? "";
  const ph = findPlaceholderSnippetsInBody(text);
  if (ph.length) {
    return {
      mode: "refine",
      hint: "Contains placeholder text — regenerate or edit.",
    };
  }

  const er = (errorReason ?? "").toLowerCase();
  if (er.includes("placeholder") || er.includes("rejected:")) {
    return {
      mode: "refine",
      hint: "Last generation had quality flags — try Regenerate.",
    };
  }

  return {
    mode: "ready",
    hint: "Looks complete — optional Approve, or use Send all from the bar below.",
  };
}
