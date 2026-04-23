import { env } from "@/lib/env";
import { isLinkedInProfileUrl } from "@/lib/parsing/recipients";
import type {
  EnrichmentProvider,
  EnrichmentQuery,
  EnrichmentResult,
} from "./types";

/**
 * Proxycurl adapter — LinkedIn profile data via their licensed API.
 *
 * We use the `linkedin/profile` endpoint. Proxycurl bills per request so
 * callers upstream cache results aggressively (see EnrichmentCache).
 *
 * Only activates when BOTH the API key is set AND the query carries a
 * LinkedIn URL — we never speculate what the LinkedIn URL might be.
 */

const BASE = "https://nubela.co/proxycurl/api/v2/linkedin";

export function makeProxycurlProvider(
  apiKey: string | undefined = env.PROXYCURL_API_KEY,
): EnrichmentProvider | null {
  if (!apiKey) return null;
  return {
    id: "proxycurl",
    canHandle: (q) =>
      Boolean(q.linkedinUrl && isLinkedInProfileUrl(q.linkedinUrl)),
    async enrich(q: EnrichmentQuery): Promise<EnrichmentResult | null> {
      if (!q.linkedinUrl || !isLinkedInProfileUrl(q.linkedinUrl)) return null;
      try {
        const url = `${BASE}?url=${encodeURIComponent(q.linkedinUrl)}&use_cache=if-present`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return null;
        const d = (await res.json()) as {
          full_name?: string;
          occupation?: string;
          headline?: string;
          summary?: string;
          experiences?: { company?: string; title?: string }[];
        };
        const currentExperience = d.experiences?.[0];
        const organization =
          currentExperience?.company ??
          d.occupation?.split(" at ")[1] ??
          undefined;
        const title =
          currentExperience?.title ??
          d.occupation?.split(" at ")[0] ??
          d.headline;
        return {
          name: d.full_name ?? q.name,
          title,
          organization,
          oneLiner: d.headline ?? d.summary?.slice(0, 180),
          source: "proxycurl",
          confidence: 0.85,
          raw: d,
        };
      } catch {
        return null;
      }
    },
  };
}
