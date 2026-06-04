'use client';

import type {
  AddMember,
  CreateProject,
  MemberListResponse,
  Project,
  ProjectListResponse,
  ProjectMember,
  UpdateProject,
} from '@rytask/contracts';
import type { ResourceEnvelope } from './client';
import { authedRequest } from './http';

/** Projects resource module (D8). CRUD + project membership. */

/** GET /projects — every project the principal can see (walks keyset pages; the set is small). */
export async function listProjects(): Promise<Project[]> {
  const all: Project[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const page = await authedRequest<ProjectListResponse>(`/projects?${params.toString()}`);
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}

/** GET /projects/{id} — one project by id. */
export async function getProject(projectId: string): Promise<Project> {
  const body = await authedRequest<ResourceEnvelope<Project>>(`/projects/${projectId}`);
  return body.data;
}

/** POST /projects — create a project (seeds default statuses + creator membership). */
export async function createProject(input: CreateProject): Promise<Project> {
  const body = await authedRequest<ResourceEnvelope<Project>>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** PATCH /projects/{id} — update / archive (`archived: true`) / restore. */
export async function updateProject(projectId: string, input: UpdateProject): Promise<Project> {
  const body = await authedRequest<ResourceEnvelope<Project>>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** DELETE /projects/{id} — delete a project. */
export function deleteProject(projectId: string): Promise<void> {
  return authedRequest<void>(`/projects/${projectId}`, { method: 'DELETE' });
}

/** GET /projects/{id}/members — the project's membership (walks pages). */
export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const all: ProjectMember[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const page = await authedRequest<MemberListResponse>(
      `/projects/${projectId}/members?${params.toString()}`,
    );
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}

/** POST /projects/{id}/members — add a member with a project role. */
export async function addProjectMember(
  projectId: string,
  input: AddMember,
): Promise<ProjectMember> {
  const body = await authedRequest<ResourceEnvelope<ProjectMember>>(
    `/projects/${projectId}/members`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return body.data;
}
