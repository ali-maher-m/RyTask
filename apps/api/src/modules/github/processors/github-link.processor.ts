import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { extractItemKeys } from '../domain/magic-words.parser';
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';
import { GithubLinksRepository } from '../repositories/github-links.repository';

/** One commit carried by a `push` delivery (already extracted at the webhook edge). */
export interface GithubCommitRef {
  sha: string;
  message: string;
  url: string;
  authorLogin: string | null;
}

/** The PR carried by a `pull_request` delivery. */
export interface GithubPrRef {
  number: number;
  title: string;
  body: string | null;
  url: string;
  authorLogin: string | null;
}

/**
 * The serialized job an accepted GitHub delivery carries (M5 — the `SlackCaptureJob` shape).
 * It holds ONLY signature-verified, minimally-extracted fields; the tenant is resolved on the
 * worker side from `connectionId` → connection row — never a payload field (Principle II).
 * `deliveryId` is GitHub's delivery GUID (reused on redelivery) → deterministic job id.
 */
export type GithubLinkJob =
  | {
      kind: 'push';
      connectionId: string;
      deliveryId: string;
      repoFullName: string;
      commits: GithubCommitRef[];
    }
  | {
      kind: 'pull_request';
      connectionId: string;
      deliveryId: string;
      repoFullName: string;
      pr: GithubPrRef;
    };

/** Outcome of processing one delivery (used by tests + telemetry). */
export type GithubLinkOutcome =
  | { status: 'processed'; linked: number }
  | { status: 'skipped'; reason: 'disconnected' | 'repo_mismatch' };

/** A normalized linkable source (one commit, or the PR) ready for key extraction. */
interface LinkSource {
  text: string;
  // Literal union (matches the db `GithubLinkKind`) — only repositories import `@rytask/db`
  // (the `no-raw-db-outside-repositories` boundary rule).
  kind: 'COMMIT' | 'PR';
  ref: string;
  url: string;
  title: string | null;
  authorLogin: string | null;
}

/**
 * GitHub link worker (M5, FR-INT-GH-006/007 — the `SlackCaptureProcessor` shape). The handler is
 * a plain callable so the integration test can invoke it directly AND via a real enqueue→Worker
 * round-trip. It:
 *   1. resolves the connection by id (global lookup) — no-op if missing/revoked (no orphaned
 *      writes after disconnect) or if the payload's repo doesn't match the connection;
 *   2. re-establishes tenant context from the SERVER-resolved connection (`tenant.run`);
 *   3. extracts item-key references from each commit message / the PR title+body;
 *   4. resolves keys through the work-items contract (`getItemContextByKey` — Principle III);
 *   5. inserts the link (`insertIfAbsent`; the unique index absorbs redelivery) and appends
 *      `GITHUB_LINKED` activity ONLY for a genuinely new link — a replay writes nothing twice.
 */
@Injectable()
export class GithubLinkProcessor {
  private readonly logger = new Logger(GithubLinkProcessor.name);

  constructor(
    private readonly connections: GithubConnectionsRepository,
    private readonly links: GithubLinksRepository,
    @Inject(WORK_ITEM_ACCESS) private readonly workItemAccess: WorkItemAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  /** Process one delivery. Safe to retry; every skip is silent and logged at debug. */
  async handle(job: GithubLinkJob): Promise<GithubLinkOutcome> {
    const connection = await this.connections.findById(job.connectionId);
    if (!connection || connection.revokedAt) {
      this.logger.debug(`link skipped: no active connection ${job.connectionId}`);
      return { status: 'skipped', reason: 'disconnected' };
    }
    if (connection.repoFullName !== job.repoFullName) {
      // Signed by the right secret but for the wrong repo — defense-in-depth, skip loudly.
      this.logger.warn(
        `link skipped: delivery repo ${job.repoFullName} != connection repo ${connection.repoFullName}`,
      );
      return { status: 'skipped', reason: 'repo_mismatch' };
    }

    return this.tenant.run(
      {
        organizationId: connection.organizationId,
        workspaceId: connection.workspaceId,
        userId: connection.createdByUserId,
        isOrgAdmin: true,
      },
      async () => {
        let linked = 0;
        for (const source of sourcesOf(job)) {
          for (const reference of extractItemKeys(source.text)) {
            const item = await this.workItemAccess.getItemContextByKey(reference.key);
            if (!item) continue; // unknown / trashed key — silently not a link
            const inserted = await this.links.insertIfAbsent({
              workItemId: item.id,
              connectionId: connection.id,
              kind: source.kind,
              externalRef: source.ref,
              url: source.url,
              title: source.title,
              authorLogin: source.authorLogin,
            });
            if (inserted) {
              await this.workItemAccess.recordGitHubLinked(item.id, {
                kind: source.kind,
                ref: source.ref,
                url: source.url,
                title: source.title,
                repoFullName: connection.repoFullName,
              });
              linked += 1;
            }
          }
        }
        return { status: 'processed', linked };
      },
    );
  }
}

/** Normalize the delivery into linkable sources (commit text vs PR title+body). */
function sourcesOf(job: GithubLinkJob): LinkSource[] {
  if (job.kind === 'push') {
    return job.commits.map((commit) => ({
      text: commit.message,
      kind: 'COMMIT' as const,
      ref: commit.sha,
      url: commit.url,
      title: firstLine(commit.message),
      authorLogin: commit.authorLogin,
    }));
  }
  return [
    {
      text: `${job.pr.title}\n${job.pr.body ?? ''}`,
      kind: 'PR' as const,
      ref: String(job.pr.number),
      url: job.pr.url,
      title: job.pr.title,
      authorLogin: job.pr.authorLogin,
    },
  ];
}

/** The first line of a commit message — the conventional summary, used as the link title. */
function firstLine(message: string): string | null {
  const line = message.split('\n', 1)[0]?.trim();
  return line && line.length > 0 ? line : null;
}
