import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.DATABASE_URL ??= "postgres://test@localhost:5432/test";
});

describe("extractBriefing", () => {
  it("returns null when no sentinel block is present", async () => {
    const { extractBriefing } = await import("./briefing-extract");
    expect(extractBriefing("What's the specific ask?")).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    const { extractBriefing } = await import("./briefing-extract");
    expect(
      extractBriefing(`<briefing_json>{not valid}</briefing_json>`),
    ).toBeNull();
  });

  it("returns null if schema-invalid (missing field)", async () => {
    const { extractBriefing } = await import("./briefing-extract");
    const txt = `<briefing_json>${JSON.stringify({
      purpose_category: "general_inquiry",
      sender_role: "student",
      // missing specific_ask, tone, length_target
    })}</briefing_json>`;
    expect(extractBriefing(txt)).toBeNull();
  });

  it("parses a valid block", async () => {
    const { extractBriefing } = await import("./briefing-extract");
    const txt = `some preamble\n<briefing_json>${JSON.stringify({
      purpose_category: "college_research",
      sender_role: "CS sophomore at UCLA",
      specific_ask: "research assistantship this summer",
      tone: "formal",
      length_target: 180,
      must_mention: ["CV link", "GitHub"],
    })}</briefing_json>\nthanks`;
    const b = extractBriefing(txt);
    expect(b).not.toBeNull();
    expect(b!.purpose_category).toBe("college_research");
    expect(b!.must_mention).toEqual(["CV link", "GitHub"]);
  });

  it("strips the block for display", async () => {
    const { stripBriefingBlock } = await import("./briefing-extract");
    const input = `Great, we're all set.\n<briefing_json>{"x":1}</briefing_json>`;
    expect(stripBriefingBlock(input)).toBe("Great, we're all set.");
  });
});
