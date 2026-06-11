import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * GitHub webhook signature policy (M5, FR-INT-GH-007 — the `slack-signature.policy` shape).
 * Pure functions over the RAW request bytes: GitHub signs the exact body with HMAC-SHA256 and
 * sends `X-Hub-Signature-256: sha256=<hex>`. Comparison is constant-time; a malformed, missing,
 * or wrong-length header is simply invalid (never an exception on the hot path).
 */

/** Compute the `sha256=<hex>` header value GitHub would send for `rawBody` under `secret`. */
export function computeGithubSignature(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export interface GithubSignatureInput {
  /** The exact request bytes (NOT re-serialized JSON — signing is byte-precise). */
  rawBody: string;
  /** The `X-Hub-Signature-256` header, if present. */
  signature: string | undefined;
  /** The connection's webhook secret (decrypted). */
  secret: string;
}

/** True only for a well-formed, constant-time-equal `sha256=<hex>` signature. */
export function verifyGithubSignature(input: GithubSignatureInput): boolean {
  if (!input.signature?.startsWith('sha256=') || input.secret.length === 0) {
    return false;
  }
  const received = Buffer.from(input.signature);
  const expected = Buffer.from(computeGithubSignature(input.secret, input.rawBody));
  return received.length === expected.length && timingSafeEqual(received, expected);
}
