import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type AuthConfigType, authConfig } from '../config/auth.config';

/**
 * Deterministic keyed hash (HMAC-SHA256) for **lookup-by-hash** secrets: refresh tokens,
 * PAT/MCP token secrets, one-time tokens, and invitation tokens. These must be located by
 * their hash, so the hash has to be deterministic — argon2 (salted) is for passwords only
 * (research D2/D3/D5/D9, NFR-SEC-002/SC-002). The plaintext is shown once and never stored.
 */
@Injectable()
export class TokenHasher {
  private readonly secret: string;

  constructor(@Inject(authConfig.KEY) config: AuthConfigType) {
    // Reuse the server secret as the HMAC key (single-secret self-host, M0).
    this.secret = config.jwt.secret;
  }

  /** Deterministic keyed hash, hex-encoded. */
  hash(plain: string): string {
    return createHmac('sha256', this.secret).update(plain).digest('hex');
  }

  /** A high-entropy opaque secret with a human-recognizable prefix (e.g. `rytask_pat_`). */
  generate(prefix: string): string {
    return `${prefix}${randomBytes(32).toString('base64url')}`;
  }

  /** Constant-time compare of a plaintext against a stored hash. */
  matches(plain: string, hash: string): boolean {
    const a = Buffer.from(this.hash(plain), 'utf8');
    const b = Buffer.from(hash, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
