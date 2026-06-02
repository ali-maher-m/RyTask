import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { type AuthConfigType, authConfig } from '../config/auth.config';
import type { PasswordHasher } from './password-hasher.port';

/**
 * argon2id implementation of {@link PasswordHasher} (research D2, NFR-SEC-002). Cost
 * parameters come from typed config (env-tunable). `verify` is constant-time and treats
 * a malformed/foreign hash as a non-match rather than throwing (defensive).
 */
@Injectable()
export class Argon2Hasher implements PasswordHasher {
  private readonly options: argon2.Options;

  constructor(@Inject(authConfig.KEY) config: AuthConfigType) {
    this.options = {
      type: argon2.argon2id,
      memoryCost: config.argon2.memoryCost,
      timeCost: config.argon2.timeCost,
      parallelism: config.argon2.parallelism,
    };
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
