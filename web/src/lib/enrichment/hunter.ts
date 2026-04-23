import { env } from "@/lib/env";
import type {
  EnrichmentProvider,
  EnrichmentQuery,
  EnrichmentResult,
} from "./types";

/**
 * Hunter.io adapter — email finder / person lookup.
 *
 * Endpoint:  GET https://api.hunter.io/v2/email-finder
 * Scenarios handled:
 *   - `email-finder` when we have name + domain
 *   - `email-verifier` when we have an email and want to add first/last name
 *
 * Activates only if `HUNTER_API_KEY` is set; otherwise callers should skip it.
 */

const BASE = "https://api.hunter.io/v2";

export function makeHunterProvider(
  apiKey: string | undefined = env.HUNTER_API_KEY,
): EnrichmentProvider | null {
  if (!apiKey) return null;

  return {
    id: "hunter",

    canHandle(q) {
      // Useful when we have an email or (name + org).
      return Boolean(q.email || (q.name && q.organization));
    },

    async enrich(q: EnrichmentQuery): Promise<EnrichmentResult | null> {
      try {
        if (q.email) return await verifyEmail(apiKey, q.email);
        if (q.name && q.organization)
          return await findByNameAndDomain(apiKey, q.name, q.organization);
        return null;
      } catch {
        return null;
      }
    },
  };
}

async function verifyEmail(
  apiKey: string,
  email: string,
): Promise<EnrichmentResult | null> {
  const url = `${BASE}/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) return null;
  const { data } = (await res.json()) as {
    data: {
      first_name?: string;
      last_name?: string;
      position?: string;
      company?: string;
      score?: number;
    };
  };
  const name =
    [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
    undefined;
  if (!name && !data.position && !data.company) return null;
  return {
    name,
    title: data.position,
    organization: data.company,
    source: "hunter.email-verifier",
    confidence: (data.score ?? 50) / 100,
    raw: data,
  };
}

async function findByNameAndDomain(
  apiKey: string,
  name: string,
  domain: string,
): Promise<EnrichmentResult | null> {
  const parts = name.split(/\s+/);
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ");
  const url =
    `${BASE}/email-finder?domain=${encodeURIComponent(domain)}` +
    `&first_name=${encodeURIComponent(first_name)}` +
    (last_name ? `&last_name=${encodeURIComponent(last_name)}` : "") +
    `&api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const { data } = (await res.json()) as {
    data: { email?: string; position?: string; score?: number; company?: string };
  };
  if (!data.email) return null;
  return {
    name,
    title: data.position,
    organization: data.company ?? domain,
    source: "hunter.email-finder",
    confidence: (data.score ?? 50) / 100,
    raw: data,
  };
}
