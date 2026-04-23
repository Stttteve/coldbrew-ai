import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.DATABASE_URL ??= "postgres://test@localhost:5432/test";
});

describe("parseRecipientLine", () => {
  it("accepts a plain email", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(parseRecipientLine("Alice@example.com")).toMatchObject({
      email: "alice@example.com",
    });
  });

  it("accepts Name <email>", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(parseRecipientLine('"Dr. Alice Chen" <alice@mit.edu>')).toMatchObject({
      name: "Dr. Alice Chen",
      email: "alice@mit.edu",
    });
  });

  it("accepts unquoted Name <email>", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(parseRecipientLine("Alice Chen <alice@mit.edu>")).toMatchObject({
      name: "Alice Chen",
      email: "alice@mit.edu",
    });
  });

  it("accepts LinkedIn URL and strips trailing slash", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(
      parseRecipientLine("https://www.linkedin.com/in/janedoe/"),
    ).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/janedoe",
    });
  });

  it("accepts a generic https profile / faculty URL", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(
      parseRecipientLine("https://viterbi.usc.edu/directory/person/meshkati/"),
    ).toMatchObject({
      linkedinUrl: "https://viterbi.usc.edu/directory/person/meshkati",
    });
  });

  it("accepts bare name", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(parseRecipientLine("Prof Hinton")).toMatchObject({
      name: "Prof Hinton",
    });
  });

  it("handles Name then space-separated email (no angle brackets)", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(
      parseRecipientLine("Jane Doe jane@acme.com"),
    ).toMatchObject({
      name: "Jane Doe",
      email: "jane@acme.com",
    });
  });

  it("flags invalid @ lines", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(parseRecipientLine("@@@invalid")).toHaveProperty("error");
  });

  it("flags empty / nonsense", async () => {
    const { parseRecipientLine } = await import("./recipients");
    expect(parseRecipientLine("  ").error).toBe("blank");
    expect(parseRecipientLine("🙃").error).toBe("unrecognised");
  });
});

describe("parseRecipientBlock", () => {
  it("ignores blank lines and returns each row", async () => {
    const { parseRecipientBlock } = await import("./recipients");
    const rows = parseRecipientBlock(
      "\n  alice@mit.edu\n\nhttps://linkedin.com/in/bob\nProf Hinton\n\n",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].email).toBe("alice@mit.edu");
    expect(rows[1].linkedinUrl).toContain("linkedin.com");
    expect(rows[2].name).toBe("Prof Hinton");
  });
});

describe("parseCsv", () => {
  it("parses a simple comma-delimited CSV with aliased headers", async () => {
    const { parseCsv } = await import("./recipients");
    const rows = parseCsv(
      `Email,Full Name,Company,LinkedIn\n` +
        `alice@mit.edu,Alice Chen,MIT,https://linkedin.com/in/alice\n` +
        `bob@acme.io,Bob,Acme,\n`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      email: "alice@mit.edu",
      name: "Alice Chen",
      organization: "MIT",
      linkedinUrl: "https://linkedin.com/in/alice",
    });
    expect(rows[1].email).toBe("bob@acme.io");
  });

  it("auto-detects semicolon delimiter (common in EU Excel exports)", async () => {
    const { parseCsv } = await import("./recipients");
    const rows = parseCsv(`email;name\nalice@mit.edu;Alice Chen`);
    expect(rows[0]).toMatchObject({
      email: "alice@mit.edu",
      name: "Alice Chen",
    });
  });

  it("handles quoted fields with commas and escaped quotes", async () => {
    const { parseCsv } = await import("./recipients");
    const rows = parseCsv(
      `email,name,title\n` +
        `a@b.com,"Doe, Alice","Assoc. Prof ""ML"""\n`,
    );
    expect(rows[0].name).toBe("Doe, Alice");
    expect(rows[0].title).toBe('Assoc. Prof "ML"');
  });

  it("marks invalid email with _error without dropping the row", async () => {
    const { parseCsv } = await import("./recipients");
    const rows = parseCsv(`email\nnot-an-email`);
    expect(rows[0]._error).toBe("invalid_email");
  });

  it("ignores unknown columns gracefully", async () => {
    const { parseCsv } = await import("./recipients");
    const rows = parseCsv(
      `Email,Department,Name\nalice@mit.edu,CSAIL,Alice`,
    );
    expect(rows[0]).toMatchObject({ email: "alice@mit.edu", name: "Alice" });
  });
});
