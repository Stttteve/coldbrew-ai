import { z } from "zod";

/**
 * All the structured outputs the LLM is expected to return, in one place.
 * Every adapter is responsible for coaxing the model into shapes that pass
 * these schemas; the callers re-parse on receipt as a belt-and-braces check.
 */

export const PURPOSE_CATEGORIES = [
  "college_research",
  "internship_job",
  "coffee_chat",
  "networking_followup",
  "general_inquiry",
  "sales_partnership",
  "alumni_intro",
] as const;

export const PURPOSE_LABEL: Record<(typeof PURPOSE_CATEGORIES)[number], string> = {
  college_research: "College / research-opportunity inquiry",
  internship_job: "Internship / job inquiry",
  coffee_chat: "Coffee chat / informational interview",
  networking_followup: "Networking follow-up (post-event)",
  general_inquiry: "General professional inquiry",
  sales_partnership: "Sales / partnership outreach",
  alumni_intro: "Alumni / warm introduction",
};

/** Typical length target per category, in words, as a [min, max]. */
export const PURPOSE_LENGTH: Record<
  (typeof PURPOSE_CATEGORIES)[number],
  [number, number]
> = {
  college_research: [150, 200],
  internship_job: [120, 160],
  coffee_chat: [100, 140],
  networking_followup: [80, 120],
  general_inquiry: [100, 150],
  sales_partnership: [80, 120],
  alumni_intro: [90, 130],
};

export const briefingSchema = z.object({
  purpose_category: z.enum(PURPOSE_CATEGORIES),
  sender_role: z.string().min(2).max(200),
  /** Optional 1–3 sentences about the sender for the model to weave in. */
  sender_intro: z.string().max(600).optional(),
  specific_ask: z.string().min(2).max(400),
  tone: z.enum(["formal", "semi_formal", "casual"]),
  length_target: z.number().int().min(40).max(400),
  must_mention: z.array(z.string().min(1).max(200)).max(8).default([]),
  signoff_style: z.string().max(80).optional(),
});
export type Briefing = z.infer<typeof briefingSchema>;

export const draftSchema = z.object({
  subject: z.string().min(3).max(120),
  body: z.string().min(20).max(4000),
  referenced_facts: z.array(z.string().min(1).max(300)).max(8).default([]),
  word_count: z.number().int().min(20).max(800),
  confidence: z.number().min(0).max(1),
});
export type DraftOutput = z.infer<typeof draftSchema>;
