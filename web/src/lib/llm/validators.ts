import type { DraftOutput } from "./schemas";

/**
 * Post-generation quality gates. Called once the writer returns a draft.
 * Each check produces a list of `issues`; if any are `severity: "reject"`,
 * the caller should regenerate. `"warn"` issues are surfaced in the UI
 * so the user can decide.
 */

export type IssueSeverity = "reject" | "warn";
export interface DraftIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

// Catch two shapes of placeholder:
//   1. mustache / handlebars tokens: {name}, {{first_name}}, {company.city}
//   2. bracketed hint strings: [Your Name], [mention a specific paper],
//      [insert GitHub link], [YOUR COMPANY]
// We deliberately allow short all-caps acronyms like [AI], [NLP], [US] by
// requiring at least one whitespace or a lowercase letter inside the brackets
// — pure single-word all-caps are kept.
export const MUSTACHE_RE = /\{\{?\s*[a-zA-Z_][\w.\-]*\s*\}?\}/g;
export const BRACKET_HINT_RE = /\[\s*(?=[^\]]*(?:\s|[a-z]))[^\]]{2,60}\]/g;

/** Placeholder tokens the draft writer must not leave in the body (UI + gates). */
export function findPlaceholderSnippetsInBody(body: string): string[] {
  const mustache = body.match(MUSTACHE_RE) ?? [];
  const bracket = body.match(BRACKET_HINT_RE) ?? [];
  return [...mustache, ...bracket];
}

// Honorifics we strip before computing a "first name".
const HONORIFICS = new Set([
  "prof",
  "prof.",
  "professor",
  "dr",
  "dr.",
  "doctor",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
  "mx",
  "mx.",
  "sir",
  "madam",
]);

function firstNameOf(fullName: string): string | null {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter((t) => !HONORIFICS.has(t.toLowerCase()));
  const first = tokens[0];
  return first && first.length > 1 ? first : null;
}

export function validateDraft(
  draft: DraftOutput,
  ctx: {
    recipientName?: string | null;
    targetLength: number;
    hadRecipientFacts: boolean;
  },
): DraftIssue[] {
  const issues: DraftIssue[] = [];

  // 1. Placeholder tokens — always reject.
  const placeholders = findPlaceholderSnippetsInBody(draft.body);
  if (placeholders.length) {
    issues.push({
      severity: "reject",
      code: "placeholder_token",
      message: `Draft contains placeholder(s): ${placeholders.slice(0, 3).join(" · ")}`,
    });
  }

  // 2. Recipient first name should appear in body. Skip honorifics like
  //    "Prof.", "Dr." so we check the actual given name.
  if (ctx.recipientName) {
    const first = firstNameOf(ctx.recipientName);
    if (first) {
      const re = new RegExp(`\\b${escapeRe(first)}\\b`, "i");
      if (!re.test(draft.body)) {
        issues.push({
          severity: "warn",
          code: "name_missing",
          message: `Recipient's first name ("${first}") not found in body.`,
        });
      }
    }
  }

  // 3. Length within ±30% of target.
  const lo = Math.floor(ctx.targetLength * 0.7);
  const hi = Math.ceil(ctx.targetLength * 1.3);
  const actual = countWords(draft.body);
  if (actual < lo || actual > hi) {
    issues.push({
      severity: "warn",
      code: "length_out_of_range",
      message: `Length ${actual} words is outside target ${ctx.targetLength}±30% (${lo}–${hi}).`,
    });
  }

  // 4. If enrichment was available but the writer cited nothing, downgrade quality.
  if (ctx.hadRecipientFacts && draft.referenced_facts.length === 0) {
    issues.push({
      severity: "warn",
      code: "no_facts_referenced",
      message: "Facts were available but none were referenced.",
    });
  }

  return issues;
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
