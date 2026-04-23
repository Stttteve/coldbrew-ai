import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runEnrichmentJob } from "@/workers/enrichment-runner";
import { runDraftJob } from "@/workers/draft-runner";

/**
 * Queue façade.
 *
 * Design goals:
 *   - Developer can run the app without Redis. We detect the absence of
 *     `REDIS_URL` (or a startup failure) and fall back to running the
 *     enrichment / drafting logic inline. This keeps `npm run dev` zero-dep.
 *   - When Redis is configured, use BullMQ with the standard priority +
 *     retry + concurrency knobs described in the plan.
 *   - Worker runtime lives in `src/workers/*`, NOT here. This module only
 *     exposes enqueue functions so API routes never import worker internals.
 *
 * Implementation note: bullmq + ioredis are declared as server-external
 * packages so webpack leaves them as runtime `require()` calls. We use
 * Node's `createRequire` to pull them in on demand — this avoids webpack
 * touching them at all in dev hot-reload, which was tripping up its
 * server-components-external-packages interaction.
 */

import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

export const ENRICHMENT_QUEUE = "enrichment";
export const DRAFT_QUEUE = "draft";

type EnqueueOpts = { priority?: number; delayMs?: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BullMQQueue = any;
interface QueueHandles {
  enrichment: BullMQQueue;
  draft: BullMQQueue;
}
type QueueState = QueueHandles | { disabled: true };

let queuesCache: QueueState | null = null;

function initQueues(): QueueState {
  if (queuesCache) return queuesCache;
  // Inline when workers aren't explicitly enabled — dev mode default.
  if (!env.USE_QUEUE_WORKERS || !env.REDIS_URL) {
    queuesCache = { disabled: true };
    return queuesCache;
  }
  try {
    const { Queue } = nodeRequire("bullmq") as typeof import("bullmq");
    const IORedis = nodeRequire("ioredis").default as typeof import("ioredis").default;
    const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queuesCache = {
      enrichment: new Queue(ENRICHMENT_QUEUE, { connection }),
      draft: new Queue(DRAFT_QUEUE, { connection }),
    };
    return queuesCache;
  } catch (e) {
    logger.warn("queue.init_failed_falling_back_to_sync", {
      message: (e as Error).message,
    });
    queuesCache = { disabled: true };
    return queuesCache;
  }
}

function isDisabled(q: QueueState): q is { disabled: true } {
  return (q as { disabled?: boolean }).disabled === true;
}

export async function enqueueEnrichment(
  recipientId: string,
  opts: EnqueueOpts = {},
) {
  const q = initQueues();
  if (isDisabled(q)) {
    runEnrichmentJob(recipientId).catch((e) =>
      logger.error("enrichment.inline_failed", {
        recipientId,
        message: (e as Error).message,
      }),
    );
    return;
  }
  await q.enrichment.add(
    "enrich",
    { recipientId },
    {
      priority: opts.priority ?? 5,
      delay: opts.delayMs,
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 86_400, count: 200 },
    },
  );
}

export async function enqueueDraft(
  recipientId: string,
  instruction?: string,
  opts: EnqueueOpts = {},
) {
  const q = initQueues();
  if (isDisabled(q)) {
    runDraftJob(recipientId, instruction).catch((e) =>
      logger.error("draft.inline_failed", {
        recipientId,
        message: (e as Error).message,
      }),
    );
    return;
  }
  await q.draft.add(
    "generate",
    { recipientId, instruction },
    {
      priority: opts.priority ?? 3,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 86_400, count: 200 },
    },
  );
}
