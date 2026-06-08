/**
 * Symmetric encryption port (M3, Principle III/VI). Encrypts secrets at rest — currently the
 * per-install Slack bot token (data-model §1.1). Behind a port so domain/provider code stays
 * pure and the algorithm is swappable; the default adapter is AES-256-GCM with a key from env.
 */

/** An AES-256-GCM ciphertext split into its stored parts (all base64). */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface Crypto {
  /** Encrypt a plaintext secret; returns ciphertext + iv + auth tag (all base64). */
  encrypt(plaintext: string): EncryptedSecret;
  /** Decrypt a previously-encrypted secret; throws if the tag fails (tamper/wrong key). */
  decrypt(secret: EncryptedSecret): string;
}

/** DI token for the Crypto port. */
export const CRYPTO = Symbol('CRYPTO');
