import type { UserSummary } from '@rytask/contracts';

/** The fields of a `users` row needed to build a `UserSummary` (structural, no @rytask/db import). */
export interface UserRowLike {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
}

/** Map a `users` row to the public `UserSummary` DTO (never leaks the password hash). */
export const toUserSummary = (user: UserRowLike): UserSummary => ({
  id: user.id,
  email: user.email,
  name: user.name,
  emailVerified: user.emailVerifiedAt !== null,
});
