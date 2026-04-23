import { Worker } from "bullmq";
import IORedis from "ioredis";

import { env } from "@/lib/env";
import { ENRICHMENT_QUEUE } from "@/lib/queue";
import { runEnrichmentJob } from "./enrichment-runner";
import { logger } from "@/lib/logger";

/**
 * Standalone BullMQ worker process for enrichment jobs.
 *
 * Run in prod via a separate container: `tsx src/workers/enrichment.ts`.
 * In dev, the queue façade falls back to inline execution, so you don't need
 * to run this unless you want queue-backed retries / ordering locally.
 */

if (!env.REDIS_URL) {
  throw new Error(
    "REDIS_URL not set. The enrichment worker requires Redis.",
  );
}

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<{ recipientId: string }>(
  ENRICHMENT_QUEUE,
  async (job) => {
    await runEnrichmentJob(job.data.recipientId);
  },
  { connection, concurrency: 10 },
);

worker.on("ready", () => logger.info("worker.enrichment.ready"));
worker.on("failed", (job, err) =>
  logger.error("worker.enrichment.failed", {
    jobId: job?.id,
    recipientId: job?.data.recipientId,
    message: err.message,
  }),
);
worker.on("completed", (job) =>
  logger.debug("worker.enrichment.done", { jobId: job.id }),
);

const shutdown = async () => {
  logger.info("worker.enrichment.shutdown");
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
