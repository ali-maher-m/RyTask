import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The OAuth `state` nonce (M3, US1, research D16). A pure, HMAC-signed, short-TTL token bound to
 * the initiating org/workspace/admin — the CSRF + org-binding control for the Slack consent flow.
 * The callback (which carries no session) trusts ONLY a state that verifies here. No server-side
 * nonce store in M3 (the signature + expiry are the integrity controls); kept pure + unit-tested.
 */

/** The org-binding the state carries (what the callback re-establishes tenant context from). */
export interface SlackOAuthStatePayload {
  organizationId: string;
  workspaceId: string;
  adminUserId: string;
}

interface SignedStateBody extends SlackOAuthStatePayload {
  /** Expiry, epoch seconds. */
  exp: number;
  /** Random uniqueness (defense in depth). */
  nonce: string;
}

/** Default state lifetime — long enough for a human consent screen, short enough to limit replay. */
export const DEFAULT_STATE_TTL_SECONDS = 600;

function base64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function hmacHex(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** Constant-time hex compare (returns false on length mismatch rather than throwing). */
function safeHexEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Sign a `state` token: `base64url(JSON body).hmacHex`. The body binds org/workspace/admin and an
 * expiry; the HMAC (over the encoded body, keyed by the app secret) makes it tamper-evident.
 */
export function signOAuthState(
  payload: SlackOAuthStatePayload,
  secret: string,
  now: Date,
  ttlSeconds: number = DEFAULT_STATE_TTL_SECONDS,
): string {
  const body: SignedStateBody = {
    ...payload,
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
    nonce: randomBytes(12).toString('base64url'),
  };
  const encoded = base64urlEncode(JSON.stringify(body));
  return `${encoded}.${hmacHex(encoded, secret)}`;
}

/**
 * Verify a `state` token and return its org-binding, or null when invalid: a bad/forged signature,
 * a malformed body, an expired `exp`, or a missing binding field all reject (no partial trust).
 */
export function verifyOAuthState(
  state: string,
  secret: string,
  now: Date,
): SlackOAuthStatePayload | null {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) {
    return null;
  }
  const encoded = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  if (!safeHexEqual(signature, hmacHex(encoded, secret))) {
    return null; // tampered or wrong key
  }
  let body: Partial<SignedStateBody>;
  try {
    body = JSON.parse(base64urlDecode(encoded)) as Partial<SignedStateBody>;
  } catch {
    return null;
  }
  if (typeof body.exp !== 'number' || body.exp * 1000 < now.getTime()) {
    return null; // expired
  }
  if (!body.organizationId || !body.workspaceId || !body.adminUserId) {
    return null;
  }
  return {
    organizationId: body.organizationId,
    workspaceId: body.workspaceId,
    adminUserId: body.adminUserId,
  };
}
