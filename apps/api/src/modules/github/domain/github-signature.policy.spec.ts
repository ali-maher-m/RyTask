import { describe, expect, it } from 'vitest';
import { computeGithubSignature, verifyGithubSignature } from './github-signature.policy';

/**
 * Unit tests for the GitHub webhook signature policy (M5, FR-INT-GH-007). A valid
 * `sha256=<hex>` over the exact bytes passes; everything else — wrong secret, tampered body,
 * malformed/missing header — fails closed.
 */
const SECRET = 'wh-secret-0123456789abcdef';
const BODY = JSON.stringify({ ref: 'refs/heads/main', commits: [{ id: 'abc', message: 'RY-1' }] });

describe('github-signature.policy', () => {
  it('accepts the signature GitHub would compute for the exact bytes', () => {
    const signature = computeGithubSignature(SECRET, BODY);
    expect(signature.startsWith('sha256=')).toBe(true);
    expect(verifyGithubSignature({ rawBody: BODY, signature, secret: SECRET })).toBe(true);
  });

  it('rejects a signature computed under a different secret', () => {
    const signature = computeGithubSignature('some-other-secret', BODY);
    expect(verifyGithubSignature({ rawBody: BODY, signature, secret: SECRET })).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    const signature = computeGithubSignature(SECRET, BODY);
    const tampered = BODY.replace('RY-1', 'RY-2');
    expect(verifyGithubSignature({ rawBody: tampered, signature, secret: SECRET })).toBe(false);
  });

  it('rejects a missing, malformed, or wrong-length header (fail closed, no throw)', () => {
    expect(verifyGithubSignature({ rawBody: BODY, signature: undefined, secret: SECRET })).toBe(
      false,
    );
    expect(verifyGithubSignature({ rawBody: BODY, signature: 'sha1=abc', secret: SECRET })).toBe(
      false,
    );
    expect(
      verifyGithubSignature({ rawBody: BODY, signature: 'sha256=deadbeef', secret: SECRET }),
    ).toBe(false);
  });

  it('rejects everything under an empty secret (unconfigured is never valid)', () => {
    const signature = computeGithubSignature('', BODY);
    expect(verifyGithubSignature({ rawBody: BODY, signature, secret: '' })).toBe(false);
  });
});
