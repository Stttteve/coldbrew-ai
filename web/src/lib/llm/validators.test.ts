import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.DATABASE_URL ??= "postgres://test@localhost:5432/test";
});

describe("validateDraft", () => {
  it("rejects placeholder tokens", async () => {
    const { validateDraft } = await import("./validators");
    const issues = validateDraft(
      {
        subject: "Hi",
        body: "Hello {{name}}, I saw your [COMPANY] page.",
        referenced_facts: [],
        word_count: 10,
        confidence: 0.5,
      },
      { targetLength: 120, hadRecipientFacts: false },
    );
    expect(issues.some((i) => i.code === "placeholder_token" && i.severity === "reject")).toBe(true);
  });

  it("warns when first name is missing", async () => {
    const { validateDraft } = await import("./validators");
    const body = "Hello there, I hope this finds you well.".repeat(10);
    const issues = validateDraft(
      {
        subject: "Hi",
        body,
        referenced_facts: [],
        word_count: 100,
        confidence: 0.5,
      },
      { recipientName: "Alice Chen", targetLength: 120, hadRecipientFacts: false },
    );
    expect(issues.some((i) => i.code === "name_missing")).toBe(true);
  });

  it("passes when first name is present", async () => {
    const { validateDraft } = await import("./validators");
    const body =
      "Hi Alice, I hope this finds you well. I wanted to ask about a project. ".repeat(
        5,
      );
    const issues = validateDraft(
      {
        subject: "Hi",
        body,
        referenced_facts: [],
        word_count: 60,
        confidence: 0.5,
      },
      { recipientName: "Alice Chen", targetLength: 60, hadRecipientFacts: false },
    );
    expect(issues.some((i) => i.code === "name_missing")).toBe(false);
  });

  it("warns when length is far from target", async () => {
    const { validateDraft } = await import("./validators");
    const body = "one two three four five";
    const issues = validateDraft(
      {
        subject: "X",
        body,
        referenced_facts: [],
        word_count: 5,
        confidence: 0.3,
      },
      { targetLength: 150, hadRecipientFacts: false },
    );
    expect(issues.some((i) => i.code === "length_out_of_range")).toBe(true);
  });

  it("warns when facts available but unused", async () => {
    const { validateDraft } = await import("./validators");
    const issues = validateDraft(
      {
        subject: "Hi",
        body: "Hi Alice, short message. ".repeat(10),
        referenced_facts: [],
        word_count: 40,
        confidence: 0.5,
      },
      { recipientName: "Alice", targetLength: 40, hadRecipientFacts: true },
    );
    expect(issues.some((i) => i.code === "no_facts_referenced")).toBe(true);
  });
});
