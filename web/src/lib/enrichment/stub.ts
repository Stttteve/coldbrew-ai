import { isLinkedInProfileUrl } from "@/lib/parsing/recipients";

import type {
  EnrichmentProvider,
  EnrichmentQuery,
  EnrichmentResult,
} from "./types";

/**
 * Deterministic enrichment "provider" used when no paid API key is set.
 *
 * Strategy:
 *   - parse what we can from the email's domain (gmail.com → generic,
 *     a .edu → "researcher at X University")
 *   - derive a title+org heuristically so the downstream UI has something
 *     to render
 *   - if a LinkedIn slug is provided, extract the last path segment as
 *     the recipient's display name candidate
 *
 * This is intentionally conservative — the stub NEVER invents specific
 * facts (no fake paper titles, etc). The draft-writer prompt then
 * gracefully degrades to a generic message for stub-enriched recipients.
 */

function titleCase(s: string): string {
  return s
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function nameFromLinkedin(url: string): string | undefined {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? titleCase(decodeURIComponent(m[1])) : undefined;
}

/** Best-effort display name from a faculty page, lab site, etc. */
function nameFromGenericProfileUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last || last.length < 2) return undefined;
    const slug = last.replace(/\.(html?|php)$/i, "");
    if (!/^[\w\-.%]+$/.test(slug)) return undefined;
    return titleCase(decodeURIComponent(slug.replace(/[-_]+/g, " ")));
  } catch {
    return undefined;
  }
}

function orgFromEmail(email: string): { org?: string; kind?: string } {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return {};
  if (domain.endsWith(".edu")) {
    const base = domain.replace(/\.edu$/, "").split(".").pop() ?? domain;
    return { org: titleCase(base), kind: "edu" };
  }
  if (domain.endsWith(".gov")) {
    return { org: titleCase(domain.replace(/\.gov$/, "")), kind: "gov" };
  }
  const generic = new Set([
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "icloud.com",
    "hotmail.com",
    "proton.me",
    "protonmail.com",
  ]);
  if (generic.has(domain)) return {};
  return { org: titleCase(domain.replace(/\.(com|io|co|ai|net|org)$/, "")) };
}

export const stubEnrichmentProvider: EnrichmentProvider = {
  id: "stub",
  canHandle() {
    return true; // last-resort fallback
  },
  async enrich(q: EnrichmentQuery): Promise<EnrichmentResult | null> {
    let name = q.name;
    if (!name && q.linkedinUrl) {
      name = isLinkedInProfileUrl(q.linkedinUrl)
        ? nameFromLinkedin(q.linkedinUrl)
        : nameFromGenericProfileUrl(q.linkedinUrl);
    }

    const fromEmail = q.email ? orgFromEmail(q.email) : {};
    const organization = q.organization ?? fromEmail.org;

    const title =
      fromEmail.kind === "edu"
        ? "academic contact"
        : fromEmail.kind === "gov"
          ? "government contact"
          : organization
            ? undefined
            : undefined;

    // Only return a result if we learned anything at all.
    if (!name && !organization && !title) return null;

    return {
      name,
      title,
      organization,
      oneLiner: undefined, // stub never invents a blurb
      source: "stub",
      confidence: 0.25,
    };
  },
};
