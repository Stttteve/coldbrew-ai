import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { env } from "@/lib/env";

/**
 * Envelope encryption for storing OAuth refresh tokens at rest.
 *
 * Design:
 *   - Each secret is encrypted with a freshly-generated per-record
 *     Data Encryption Key (DEK) using AES-256-GCM.
 *   - The DEK is then encrypted (“wrapped”) with a Key Encryption Key
 *     (KEK) before being stored alongside the ciphertext.
 *   - In production the KEK lives in a KMS (AWS KMS / GCP KMS) — NEVER
 *     in app memory or the database. The `wrapDek` / `unwrapDek`
 *     functions below are the extension point: replace them with a
 *     KMS call when deploying.
 *
 * Binary layout we write to Postgres `bytea`:
 *
 *     [ version (1B) | wrappedDekLen (2B BE) | wrappedDek | iv (12B) | authTag (16B) | ciphertext ]
 *
 * The single-byte version lets us rotate algorithms (e.g. move from
 * AES-GCM to a KMS-native scheme) without invalidating existing rows.
 *
 * For local development we simulate the KEK with a 32-byte master key
 * read from `DATA_ENCRYPTION_KEY` (hex). We derive a deterministic
 * per-app KEK from it so rotating this var effectively rotates the KEK.
 */

const VERSION_BYTE = 0x01;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const DEK_LEN = 32;

function devKek(): Buffer {
  if (!env.DATA_ENCRYPTION_KEY) {
    throw new Error(
      "DATA_ENCRYPTION_KEY is required to encrypt/decrypt tokens. " +
        "Generate one with: openssl rand -hex 32",
    );
  }
  const master = Buffer.from(env.DATA_ENCRYPTION_KEY, "hex");
  // Domain-separate so the raw master key is never used directly.
  return createHash("sha256").update(master).update("coldbrew:kek:v1").digest();
}

/**
 * Wrap (encrypt) a DEK with the KEK. Default impl uses AES-256-GCM with a
 * dev master key. Swap this with a KMS encrypt call in prod.
 */
function wrapDek(dek: Buffer): Buffer {
  const kek = devKek();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

function unwrapDek(wrapped: Buffer): Buffer {
  const kek = devKek();
  const iv = wrapped.subarray(0, IV_LEN);
  const tag = wrapped.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ct = wrapped.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Encrypt a UTF-8 secret (e.g. an OAuth refresh token) for storage.
 * Returns a single Buffer ready to be written to a Postgres `bytea` column.
 */
export function encryptSecret(plaintext: string): Buffer {
  const dek = randomBytes(DEK_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const wrappedDek = wrapDek(dek);
  const wrappedDekLen = Buffer.alloc(2);
  wrappedDekLen.writeUInt16BE(wrappedDek.length, 0);

  // Zero out DEK from memory ASAP (not a hard guarantee in V8 but reduces exposure)
  dek.fill(0);

  return Buffer.concat([
    Buffer.from([VERSION_BYTE]),
    wrappedDekLen,
    wrappedDek,
    iv,
    authTag,
    ciphertext,
  ]);
}

/**
 * Decrypt a previously-encrypted secret. Throws if the blob is malformed,
 * the DEK can’t be unwrapped, or the auth tag check fails.
 */
export function decryptSecret(blob: Buffer): string {
  if (blob.length < 1 + 2 + IV_LEN + AUTH_TAG_LEN) {
    throw new Error("Ciphertext blob is too short");
  }
  const version = blob[0];
  if (version !== VERSION_BYTE) {
    throw new Error(`Unsupported ciphertext version: 0x${version.toString(16)}`);
  }
  const wrappedDekLen = blob.readUInt16BE(1);
  let offset = 3;
  const wrappedDek = blob.subarray(offset, offset + wrappedDekLen);
  offset += wrappedDekLen;
  const iv = blob.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const authTag = blob.subarray(offset, offset + AUTH_TAG_LEN);
  offset += AUTH_TAG_LEN;
  const ciphertext = blob.subarray(offset);

  const dek = unwrapDek(wrappedDek);
  try {
    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/**
 * Stable hash for cache keys (e.g. EnrichmentCache.keyHash).
 * NOT for passwords — use argon2 for those.
 */
export function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
