import { z } from 'zod';

/**
 * GitHub lightweight-linking DTOs (M5, FR-INT-GH-006/007 — BRD §5.1 "GitHub (lightweight only)").
 * One connection row per repository; RyTask mints the webhook secret and shows it ONCE in the
 * create response — it is stored encrypted and never appears in any read DTO (Principle VI).
 */

/** One repository connection (GET /integrations/github). No secret material, ever. */
export interface GithubConnectionDto {
  id: string;
  /** `owner/repo` as GitHub reports it in `repository.full_name`. */
  repoFullName: string;
  connectedAt: string;
  revokedAt: string | null;
  /** API-relative webhook path to paste into the repo settings (`/api/v1` prefix included). */
  webhookPath: string;
}

/** GET /integrations/github — all of the org's repository connections. */
export interface ListGithubConnectionsResponse {
  data: GithubConnectionDto[];
}

/**
 * POST /integrations/github — connect a repository. `repoFullName` is the exact
 * `owner/repo`; payloads from any other repository are skipped server-side.
 */
export const createGithubConnectionSchema = z
  .object({
    repoFullName: z
      .string()
      .min(3)
      .max(140)
      .regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/repo'),
  })
  .strict();
export type CreateGithubConnectionInput = z.infer<typeof createGithubConnectionSchema>;

/** The create response — the ONLY time the webhook secret is visible (copy it now). */
export interface CreateGithubConnectionResponse {
  data: GithubConnectionDto;
  /** Paste into the GitHub webhook's "Secret" field. Not retrievable again. */
  webhookSecret: string;
}

/** What a `GITHUB_LINKED` activity row's `newValue` carries (rendered in the item feed). */
export interface GithubLinkedActivityValue {
  kind: 'COMMIT' | 'PR';
  /** Commit sha (short ref ok for display) or PR number as text. */
  ref: string;
  url: string;
  title: string | null;
  repoFullName: string;
}
