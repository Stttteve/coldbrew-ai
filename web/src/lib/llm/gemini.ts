import { GoogleGenAI } from "@google/genai";

import { env } from "@/lib/env";
import type {
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  ModelAdapter,
  StreamEvent,
} from "./types";

/**
 * Google Gemini adapter (AI Studio / Google Cloud API).
 *
 * Model choice by tier:
 *   - fast:   gemini-2.5-flash-lite  (1000 RPD free-tier quota — the
 *                                      workhorse for dev)
 *   - strong: gemini-2.5-flash       (higher quality but only 20-250 RPD
 *                                      on free-tier, so reserved for the
 *                                      draft writer which is called
 *                                      fewer times than the briefing chat)
 *
 * Rationale for the split: the briefing chat is bursty (often 3–5 calls
 * per project) so we put it on the generous Flash-Lite quota. Draft
 * writing is one call per recipient and the output quality matters more,
 * so we spend Flash budget there.
 *
 * If you hit a 429 on Flash for drafts, the quickest workaround is to
 * point `strong` at flash-lite too:
 *
 *   GEMINI_MODEL_STRONG="gemini-2.5-flash-lite"
 *
 * Gemini 2.5 Pro is NOT in the free tier (quota=0). Only set it if you
 * have a paid Google Cloud billing account.
 *
 * Environment variables (either key works — first one wins):
 *   - GOOGLE_API_KEY       (Google AI Studio / "Gemini API Key")
 *   - GEMINI_API_KEY       (conventional alias for the same key)
 *   - GEMINI_MODEL_FAST    (override the fast tier default)
 *   - GEMINI_MODEL_STRONG  (override the strong tier default)
 *
 * Gemini takes `system instruction` as a dedicated config field (NOT a
 * message with role: "system"), and uses `role: "model"` for assistant
 * turns — we translate on the way in.
 */

const DEFAULT_MODELS = {
  fast: "gemini-2.5-flash-lite",
  // 2.5 Flash has much tighter free-tier daily quota (as low as 20 RPD on
  // some accounts). Default strong to Flash-Lite too so development flows
  // don't burn out after a few projects. Users with a paid key can
  // override back to Flash or Pro via GEMINI_MODEL_STRONG.
  strong: "gemini-2.5-flash-lite",
} as const;

function modelFor(tier: "fast" | "strong"): string {
  if (tier === "fast") return env.GEMINI_MODEL_FAST ?? DEFAULT_MODELS.fast;
  return env.GEMINI_MODEL_STRONG ?? DEFAULT_MODELS.strong;
}

function splitMessages(messages: ChatMessage[]) {
  const systemInstruction = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      // Gemini uses "model" instead of "assistant"
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  return { systemInstruction: systemInstruction || undefined, contents };
}

function buildConfig(opts: GenerateOptions, systemInstruction?: string) {
  return {
    temperature: opts.temperature ?? 0.5,
    // Gemini 2.5 models have "thinking" on by default, which chews through
    // output tokens before a single character of visible text is produced.
    // For our short conversational + short-form-draft workloads we disable
    // it. Callers that actually want reasoning can pass `maxTokens` high
    // enough and set temperature appropriately.
    maxOutputTokens: opts.maxTokens ?? 2048,
    thinkingConfig: { thinkingBudget: 0 },
    systemInstruction,
    ...(opts.jsonSchemaName
      ? { responseMimeType: "application/json" as const }
      : {}),
  };
}

export class GeminiAdapter implements ModelAdapter {
  readonly vendor = "gemini" as const;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string = env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error(
        "GeminiAdapter instantiated without an API key. Set GOOGLE_API_KEY in .env.local.",
      );
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const model = modelFor(opts.tier);
    const { systemInstruction, contents } = splitMessages(opts.messages);

    try {
      const res = await this.client.models.generateContent({
        model,
        contents,
        config: buildConfig(opts, systemInstruction),
      });
      const text = res.text ?? "";
      const tokensUsed = res.usageMetadata?.totalTokenCount ?? 0;
      return { text, tokensUsed, model };
    } catch (e) {
      throw new Error(humaniseGeminiError(e, model));
    }
  }

  async *stream(opts: GenerateOptions): AsyncIterable<StreamEvent> {
    const model = modelFor(opts.tier);
    const { systemInstruction, contents } = splitMessages(opts.messages);

    let iterable: AsyncIterable<{
      text?: string;
      usageMetadata?: { totalTokenCount?: number };
    }>;
    try {
      iterable = await this.client.models.generateContentStream({
        model,
        contents,
        config: buildConfig(opts, systemInstruction),
      });
    } catch (e) {
      yield { type: "error", text: humaniseGeminiError(e, model) };
      return;
    }

    let totalTokens = 0;
    try {
      for await (const chunk of iterable) {
        const delta = chunk.text;
        if (delta) yield { type: "token", text: delta };
        const usage = chunk.usageMetadata?.totalTokenCount;
        if (typeof usage === "number") totalTokens = usage;
      }
      yield {
        type: "end",
        usage: { tokensUsed: totalTokens, model },
      };
    } catch (e) {
      yield { type: "error", text: humaniseGeminiError(e, model) };
    }
  }
}

/**
 * Turn the Gemini SDK's verbose error payloads into short, actionable
 * messages. Keeps the UI bubble and the errorReason column readable.
 */
function humaniseGeminiError(e: unknown, model: string): string {
  const raw = (e as Error)?.message ?? String(e);
  // 429 — free-tier daily/per-minute quota hit.
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    const retry = raw.match(/retry in ([\d.]+)s/i)?.[1];
    return (
      `Gemini free-tier quota hit for ${model}.` +
      (retry ? ` Try again in ~${Math.ceil(parseFloat(retry))}s.` : "") +
      ` Quick fix: set GEMINI_MODEL_FAST="gemini-2.5-flash-lite" and` +
      ` GEMINI_MODEL_STRONG="gemini-2.5-flash-lite" in .env.local, then restart the dev server.`
    );
  }
  // 400 — usually bad input or unsupported model.
  if (/400|INVALID_ARGUMENT/i.test(raw)) {
    return `Gemini request rejected (likely bad model name or oversized input). Model: ${model}.`;
  }
  // 401 / 403 — auth.
  if (/401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(raw)) {
    return `Gemini API key was rejected. Check GOOGLE_API_KEY in .env.local.`;
  }
  // Fallback — truncate long JSON blobs.
  return `Gemini error: ${raw.slice(0, 240)}${raw.length > 240 ? "…" : ""}`;
}
