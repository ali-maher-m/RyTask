'use client';

import type {
  Project,
  ProjectListResponse,
  WorkItem,
  WorkItemListResponse,
} from '@rytask/contracts';

/**
 * Browser API client for the cross-project "My Work" page (US4, T075, FR-PROJ-006). The
 * hand-written `@rytask/sdk` only covers health today, so this calls `/api/v1` with `fetch`,
 * mirroring `app/projects/[projectId]/api-client.ts`. The dev principal is still resolved from
 * headers in M1 (apps/api `resolveDevPrincipal`). List envelopes follow openapi.yaml:
 * `{ data, pageInfo }` with keyset cursor pagination.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Dev principal headers (M1 seam — apps/api/src/common/auth/principal.ts). */
const SEED_USER_ID = '0193b3a0-0000-7000-8000-000000000003';
const SEED_ORG_ID = '0193b3a0-0000-7000-8000-000000000001';
const SEED_WORKSPACE_ID = '0193b3a0-0000-7000-8000-000000000002';

function principalHeaders(): Record<string, string> {
  return {
    'x-user-id': process.env.NEXT_PUBLIC_DEV_USER_ID ?? SEED_USER_ID,
    'x-organization-id': process.env.NEXT_PUBLIC_DEV_ORG_ID ?? SEED_ORG_ID,
    'x-workspace-id': process.env.NEXT_PUBLIC_DEV_WORKSPACE_ID ?? SEED_WORKSPACE_ID,
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json', ...principalHeaders() },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** One page of the "My Work" smart view (`smart=my-work` → assignee=me, cross-project). */
export interface MyWorkPage {
  items: WorkItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Read one keyset page of the current user's assigned items across every accessible project
 * (`GET /work-items?smart=my-work`). The page is cursor-paginated; `cursor` advances it.
 */
export async function listMyWork(cursor?: string | null, limit = 50): Promise<MyWorkPage> {
  const params = new URLSearchParams({ smart: 'my-work', limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const page = await request<WorkItemListResponse>(`/work-items?${params.toString()}`);
  return {
    items: page.data,
    nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null,
    hasNextPage: page.pageInfo.hasNextPage,
  };
}

/**
 * List the accessible projects (walks every keyset page; M1 orgs are small) so "My Work" can
 * label each cross-project item with its project name + key prefix.
 */
export async function listAllProjects(): Promise<Project[]> {
  const all: Project[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const page: ProjectListResponse = await request<ProjectListResponse>(
      `/projects?${params.toString()}`,
    );
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}
