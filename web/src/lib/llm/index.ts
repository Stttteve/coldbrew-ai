import { env } from "@/lib/env";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";
import { OpenAIAdapter } from "./openai";
import { StubAdapter } from "./stub";
import type { ModelAdapter } from "./types";

/**
 * Selects the active LLM adapter for the current runtime.
 *
 * Priority (first configured key wins):
 *   1. GOOGLE_API_KEY / GEMINI_API_KEY → Gemini
 *        (the first one we recommend — Google AI Studio gives real free tier)
 *   2. ANTHROPIC_API_KEY               → Anthropic
 *        (best-in-class for cold-email tone; paid)
 *   3. OPENAI_API_KEY                  → OpenAI
 *   4. otherwise                       → Stub (deterministic, offline)
 *
 * A singleton is returned so that adapters keep SDK clients warm (connection
 * pools, token buckets) without us rebuilding one per request.
 */

let cached: ModelAdapter | null = null;

function build(): ModelAdapter {
  const geminiKey = env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY;
  if (geminiKey) return new GeminiAdapter(geminiKey);
  if (env.ANTHROPIC_API_KEY) return new AnthropicAdapter(env.ANTHROPIC_API_KEY);
  if (env.OPENAI_API_KEY) return new OpenAIAdapter(env.OPENAI_API_KEY);
  return new StubAdapter();
}

export function getModel(): ModelAdapter {
  if (!cached) cached = build();
  return cached;
}

/** For tests only — overrides the singleton. */
export function __setModelForTesting(adapter: ModelAdapter | null) {
  cached = adapter;
}

export type { ModelAdapter } from "./types";
