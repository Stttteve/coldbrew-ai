import { Worker } from "bullmq";
import IORedis from "ioredis";

import { env } from "@/lib/env";
import { DRAFT_QUEUE } from "@/lib/queue";
import { runDraftJob } from "./draft-runner";
import { logger } from "@/lib/logger";

/**
 * Standalone BullMQ worker for draft generation.
 *
 * Concurrency is capped at 10 per the plan (§9.6). In prod run via:
 *   tsx src/workers/draft.ts
 */

if (!env.REDIS_URL) throw new Error("REDIS_URL not set — draft worker needs Redis.");

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<{ recipientId: string; instruction?: string }>(
  DRAFT_QUEUE,
  async (job) => {
    await runDraftJob(job.data.recipientId, job.data.instruction);
  },
  { connection, concurrency: 10 },
);

worker.on("ready", () => logger.info("worker.draft.ready"));
worker.on("failed", (job, err) =>
  logger.error("worker.draft.failed", {
    jobId: job?.id,
    recipientId: job?.data.recipientId,
    message: err.message,
  }),
);

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
