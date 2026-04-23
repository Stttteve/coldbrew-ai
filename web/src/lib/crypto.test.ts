import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

// Force a deterministic DEV master key before importing the module under test.
beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.DATABASE_URL ??= "postgres://test@localhost:5432/test";
});

describe("envelope encryption", () => {
  it("round-trips a small utf-8 secret", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const plaintext = "ya29.a0AfH6SMBexampletoken";
    const blob = encryptSecret(plaintext);
    expect(Buffer.isBuffer(blob)).toBe(true);
    expect(decryptSecret(blob)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV + DEK)", async () => {
    const { encryptSecret } = await import("./crypto");
    const a = encryptSecret("hello-world");
    const b = encryptSecret("hello-world");
    expect(a.equals(b)).toBe(false);
  });

  it("fails authenticity check when ciphertext is tampered", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const blob = encryptSecret("sensitive-refresh-token");
    const tampered = Buffer.from(blob);
    // flip last byte of ciphertext
    tampered[tampered.length - 1] ^= 0x01;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects unsupported version byte", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const blob = encryptSecret("test");
    const tampered = Buffer.from(blob);
    tampered[0] = 0x99;
    expect(() => decryptSecret(tampered)).toThrow(/Unsupported/);
  });

  it("handles multi-kilobyte payloads", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const big = "x".repeat(4096);
    expect(decryptSecret(encryptSecret(big))).toBe(big);
  });
});

describe("stableHash", () => {
  it("is deterministic", async () => {
    const { stableHash } = await import("./crypto");
    expect(stableHash("prof@berkeley.edu")).toBe(
      stableHash("prof@berkeley.edu"),
    );
  });

  it("differs across inputs", async () => {
    const { stableHash } = await import("./crypto");
    expect(stableHash("a")).not.toBe(stableHash("b"));
  });
});
