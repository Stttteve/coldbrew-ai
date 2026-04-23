import OpenAI from "openai";

import { env } from "@/lib/env";
import type {
  GenerateOptions,
  GenerateResult,
  ModelAdapter,
  StreamEvent,
} from "./types";

/**
 * OpenAI adapter (fallback / alternative).
 *
 * Model choice by tier — use chat completions, which is the lowest-common-
 * denominator API across the SDK's major versions and stays compatible if a
 * user swaps to OpenRouter / Azure OpenAI / vLLM-compatible hosts.
 *
 *   - fast:   gpt-4o-mini (cheap + fast)
 *   - strong: gpt-4o       (reasoning-class, strong structured output)
 */

const MODEL_BY_TIER = {
  fast: "gpt-4o-mini",
  strong: "gpt-4o",
} as const;

export class OpenAIAdapter implements ModelAdapter {
  readonly vendor = "openai" as const;
  private readonly client: OpenAI;

  constructor(apiKey: string = env.OPENAI_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error(
        "OpenAIAdapter instantiated without an API key. Set OPENAI_API_KEY or use the stub adapter.",
      );
    }
    this.client = new OpenAI({ apiKey });
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const model = MODEL_BY_TIER[opts.tier];
    const res = await this.client.chat.completions.create({
      model,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens,
      response_format:
        opts.jsonSchemaName ? { type: "json_object" } : undefined,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    const text = res.choices[0]?.message?.content ?? "";
    const tokensUsed =
      (res.usage?.prompt_tokens ?? 0) + (res.usage?.completion_tokens ?? 0);
    return { text, tokensUsed, model };
  }

  async *stream(opts: GenerateOptions): AsyncIterable<StreamEvent> {
    const model = MODEL_BY_TIER[opts.tier];
    const stream = await this.client.chat.completions.create({
      model,
      stream: true,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    let totalOutputChars = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        totalOutputChars += delta.length;
        yield { type: "token", text: delta };
      }
    }
    // OpenAI streaming doesn't send usage by default on chat.completions.
    // Approximate so the UI can show a cost figure.
    yield {
      type: "end",
      usage: {
        tokensUsed: Math.ceil(totalOutputChars / 4),
        model,
      },
    };
  }
}
