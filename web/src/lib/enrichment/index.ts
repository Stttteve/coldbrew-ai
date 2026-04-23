import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { stableHash } from "@/lib/crypto";
import { logger } from "@/lib/logger";

import { isLinkedInProfileUrl } from "@/lib/parsing/recipients";

import { stubEnrichmentProvider } from "./stub";
import { makeHunterProvider } from "./hunter";
import { makeProxycurlProvider } from "./proxycurl";
import type {
  EnrichmentProvider,
  EnrichmentQuery,
  EnrichmentResult,
} from "./types";

/**
 * Enrichment dispatcher.
 *
 * For a given query we:
 *   1. Look in EnrichmentCache first (30-day TTL, keyed by sha256 of email|linkedin).
 *   2. Walk the configured providers in priority order. First non-null wins.
 *   3. Persist to cache.
 *
 * Privacy: if `privacyMode` is true, we skip network providers entirely and
 * return only what the stub derives locally. The UI exposes this as a
 * per-project toggle (spec §10.5).
 */

function buildProviderChain(): EnrichmentProvider[] {
  const chain: EnrichmentProvider[] = [];
  const proxy = makeProxycurlProvider();
  if (proxy) chain.push(proxy);
  const hunter = makeHunterProvider();
  if (hunter) chain.push(hunter);
  // Stub is always last — guaranteed to answer something cheap.
  chain.push(stubEnrichmentProvider);
  return chain;
}

const chain = buildProviderChain();

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

function cacheKey(q: EnrichmentQuery): string | null {
  if (q.linkedinUrl) {
    const u = q.linkedinUrl.toLowerCase();
    const prefix = isLinkedInProfileUrl(q.linkedinUrl) ? "li|" : "url|";
    return prefix + stableHash(u);
  }
  if (q.email) return "em|" + stableHash(q.email.toLowerCase());
  if (q.name && q.organization)
    return (
      "no|" +
      stableHash(q.name.toLowerCase() + "|" + q.organization.toLowerCase())
    );
  return null;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

export async function enrichRecipient(
  q: EnrichmentQuery,
  opts: { privacyMode?: boolean } = {},
): Promise<EnrichmentResult | null> {
  const key = cacheKey(q);

  if (key) {
    const hit = await prisma.enrichmentCache.findUnique({ where: { keyHash: key } });
    if (hit && hit.expiresAt > new Date()) {
      logger.debug("enrichment.cache_hit", { key });
      return hit.data as unknown as EnrichmentResult;
    }
  }

  const providers = opts.privacyMode ? [stubEnrichmentProvider] : chain;

  for (const p of providers) {
    if (!p.canHandle(q)) continue;
    const res = await withTimeout(p.enrich(q), TIMEOUT_MS);
    if (res) {
      if (key) {
        const json = JSON.parse(JSON.stringify(res)) as Prisma.InputJsonValue;
        await prisma.enrichmentCache
          .upsert({
            where: { keyHash: key },
            create: {
              keyHash: key,
              provider: p.id,
              data: json,
              expiresAt: new Date(Date.now() + TTL_MS),
            },
            update: {
              provider: p.id,
              data: json,
              fetchedAt: new Date(),
              expiresAt: new Date(Date.now() + TTL_MS),
            },
          })
          .catch((e) =>
            logger.warn("enrichment.cache_write_failed", {
              message: (e as Error).message,
            }),
          );
      }
      return res;
    }
  }

  return null;
}

export type { EnrichmentQuery, EnrichmentResult };
