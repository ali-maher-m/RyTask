import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure Slack request-signature verification (M3, US2, FR-SLK-014, research D4, slack-capture-flow
 * §1). Slack signs every slash/interactivity webhook with HMAC-SHA256 over `v0:{ts}:{rawBody}`
 * using the app's signing secret. We verify the signature AND a freshness window (≤300 s) before
 * any handler work — a forged or replayed request is rejected (no item, nothing enqueued).
 *
 * This is a leaf domain function: no Nest, no I/O, no clock — the timestamp `now` is injected so
 * it is deterministic and unit-testable with known vectors. The guard (`slack-signature.guard.ts`)
 * is the only place that reads the raw body and calls this.
 */

/** Slack's allowed clock skew / replay window: 5 minutes (300 s), per Slack's own guidance. */
export const SLACK_SIGNATURE_MAX_AGE_SECONDS = 300;

export interface SlackSignatureInput {
  /** The EXACT raw request body bytes as a string (signature is byte-sensitive). */
  rawBody: string;
  /** `X-Slack-Request-Timestamp` header (unix seconds, as sent). */
  timestamp: string | undefined;
  /** `X-Slack-Signature` header (`v0=<hex>`). */
  signature: string | undefined;
  /** The app's `SLACK_SIGNING_SECRET`. */
  signingSecret: string;
  /** Current unix time in SECONDS (injected — `Math.floor(clock.now()/1000)`). */
  nowSeconds: number;
}

/** Compute the expected `v0=`-prefixed hex signature for a raw body + timestamp. */
export function computeSlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
): string {
  const basestring = `v0:${timestamp}:${rawBody}`;
  return `v0=${createHmac('sha256', signingSecret).update(basestring).digest('hex')}`;
}

/**
 * Constant-time verify of a Slack request signature + freshness. Returns false (never throws) for
 * any malformed/missing/stale/forged input, so the guard maps a single boolean to 401.
 */
export function verifySlackSignature(input: SlackSignatureInput): boolean {
  const { rawBody, timestamp, signature, signingSecret, nowSeconds } = input;
  if (!timestamp || !signature || !signingSecret) {
    return false;
  }
  // Reject stale timestamps (replay window). A non-numeric timestamp fails the |Δ| check.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SLACK_SIGNATURE_MAX_AGE_SECONDS) {
    return false;
  }
  const expected = computeSlackSignature(signingSecret, timestamp, rawBody);
  // timingSafeEqual requires equal-length buffers; a length mismatch is an instant (safe) reject.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
