import { describe, expect, it } from 'vitest';
import {
  SLACK_SIGNATURE_MAX_AGE_SECONDS,
  computeSlackSignature,
  verifySlackSignature,
} from './slack-signature.policy';

/**
 * Unit test for the pure Slack signature policy (T045, US2, slack-capture-flow §1). Known-vector
 * valid/invalid signatures + stale-timestamp rejection. No I/O, no clock — deterministic.
 */
const SECRET = 'test-signing-secret';
const RAW_BODY = 'token=abc&team_id=T1&command=%2Ftask&text=hello';
const TS = '1700000000';
const NOW = 1700000005; // 5 s after the request — well inside the window

const validSig = computeSlackSignature(SECRET, TS, RAW_BODY);

const base = {
  rawBody: RAW_BODY,
  timestamp: TS,
  signature: validSig,
  signingSecret: SECRET,
  nowSeconds: NOW,
};

describe('verifySlackSignature', () => {
  it('accepts a correctly-signed, fresh request', () => {
    expect(verifySlackSignature(base)).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    expect(verifySlackSignature({ ...base, rawBody: `${RAW_BODY}&injected=1` })).toBe(false);
  });

  it('rejects a wrong/forged signature', () => {
    expect(verifySlackSignature({ ...base, signature: 'v0=deadbeef' })).toBe(false);
  });

  it('rejects a signature signed with the wrong secret', () => {
    const wrong = computeSlackSignature('other-secret', TS, RAW_BODY);
    expect(verifySlackSignature({ ...base, signature: wrong })).toBe(false);
  });

  it('rejects a stale timestamp (older than the 300 s window)', () => {
    const stale = NOW + SLACK_SIGNATURE_MAX_AGE_SECONDS + 1;
    // Sign with the stale ts so only freshness — not the signature — fails.
    const staleSig = computeSlackSignature(SECRET, String(NOW), RAW_BODY);
    expect(
      verifySlackSignature({
        ...base,
        timestamp: String(NOW),
        signature: staleSig,
        nowSeconds: stale,
      }),
    ).toBe(false);
  });

  it('rejects a future timestamp beyond the window', () => {
    expect(verifySlackSignature({ ...base, nowSeconds: NOW - 10_000 })).toBe(false);
  });

  it('rejects missing timestamp or signature', () => {
    expect(verifySlackSignature({ ...base, timestamp: undefined })).toBe(false);
    expect(verifySlackSignature({ ...base, signature: undefined })).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    const sig = computeSlackSignature(SECRET, 'not-a-number', RAW_BODY);
    expect(verifySlackSignature({ ...base, timestamp: 'not-a-number', signature: sig })).toBe(
      false,
    );
  });
});
