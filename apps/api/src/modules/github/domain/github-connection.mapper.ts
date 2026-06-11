import type { GithubConnectionDto } from '@rytask/contracts';
import type { GithubConnectionRow } from '../repositories/github-connections.repository';

/**
 * Row → DTO (M5). No secret material ever leaves the row (Principle VI) — the webhook secret
 * appears exactly once, in the create response, straight from the generator. `webhookPath`
 * includes the global `/api/v1` prefix so the admin can paste `<api-origin> + webhookPath`
 * directly into GitHub's webhook settings.
 */
export function toGithubConnectionDto(row: GithubConnectionRow): GithubConnectionDto {
  return {
    id: row.id,
    repoFullName: row.repoFullName,
    connectedAt: row.connectedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    webhookPath: `/api/v1/integrations/github/webhook/${row.id}`,
  };
}
