/**
 * Port for password / secret hashing (research D2, NFR-SEC-002). Injected so domain
 * logic is pure and the algorithm is swappable; the default adapter is argon2id.
 * Also used for one-time-token and PAT secret hashing (US6/US7).
 */
export interface PasswordHasher {
  /** Hash a plaintext secret (argon2id). */
  hash(plain: string): Promise<string>;
  /** Constant-time verify of a plaintext against a stored hash. */
  verify(hash: string, plain: string): Promise<boolean>;
}

/** DI token for the PasswordHasher port. */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
