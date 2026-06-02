import type { ApiTokenDto, ApiTokenType } from '@rytask/contracts';

/** The fields of an `api_tokens` row needed to build the DTO (structural — no @rytask/db import). */
export interface ApiTokenRowLike {
  id: string;
  name: string;
  type: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Map an api-token row to the public DTO (NEVER includes the secret/hash — SC-002). */
export const toApiTokenDto = (row: ApiTokenRowLike): ApiTokenDto => ({
  id: row.id,
  name: row.name,
  type: row.type as ApiTokenType,
  scopes: row.scopes,
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  expiresAt: row.expiresAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});
