import { briefingSchema, type Briefing } from "./schemas";

/**
 * Parse the final-briefing payload out of the interviewer's message.
 *
 * Different models emit "the briefing is ready" in different ways regardless
 * of how clearly we ask in the system prompt. We try three patterns, in
 * order, returning the first that successfully validates against the
 * schema:
 *
 *   1. Our preferred `<briefing_json>{...}</briefing_json>` sentinel.
 *      Anthropic and GPT-4 follow this; Gemini sometimes ignores it.
 *   2. A triple-backtick fenced ```json { ... } ``` block.
 *      Gemini's default behaviour for structured output.
 *   3. A bare top-level JSON object containing the `purpose_category` key.
 *      Catches models that just dump JSON with no fencing.
 *
 * A return value of `null` means "briefing not yet complete" — a totally
 * normal mid-interview state, so we do NOT throw.
 */

const SENTINEL_RE = /<briefing_json>\s*([\s\S]*?)\s*<\/briefing_json>/i;
const FENCED_RE =
  /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
// Matches the FIRST balanced `{...}` containing "purpose_category". Cheap
// and good-enough: real prose almost never contains that key.
const BARE_OBJECT_RE = /\{[\s\S]*?"purpose_category"[\s\S]*?\}/;

function tryParse(s: string | undefined): Briefing | null {
  if (!s) return null;
  try {
    const raw = JSON.parse(s);
    const parsed = briefingSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function extractBriefing(assistantText: string): Briefing | null {
  const sentinel = assistantText.match(SENTINEL_RE)?.[1];
  const s1 = tryParse(sentinel);
  if (s1) return s1;

  const fenced = assistantText.match(FENCED_RE)?.[1];
  const s2 = tryParse(fenced);
  if (s2) return s2;

  const bare = assistantText.match(BARE_OBJECT_RE)?.[0];
  const s3 = tryParse(bare);
  if (s3) return s3;

  return null;
}

/**
 * Strip whichever briefing envelope the model used, so the UI shows a clean
 * "done, here's what I got" bubble instead of raw JSON.
 */
export function stripBriefingBlock(assistantText: string): string {
  return assistantText
    .replace(SENTINEL_RE, "")
    .replace(FENCED_RE, "")
    .trim();
}
