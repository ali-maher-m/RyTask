import type { Organization, OrgSettings, Workspace } from '@rytask/contracts';

/** A `organizations` row shape (structural — no @rytask/db import in providers/). */
export interface OrgRowLike {
  id: string;
  name: string;
  slug: string;
  settings: OrgSettings;
}

/** A `workspaces` row shape. */
export interface WorkspaceRowLike {
  id: string;
  name: string;
  slug: string;
}

/** Map an org row to the public `Organization` DTO. */
export const toOrgDto = (row: OrgRowLike): Organization => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  settings: row.settings ?? {},
});

/** Map a workspace row to the public `Workspace` DTO. */
export const toWorkspaceDto = (row: WorkspaceRowLike): Workspace => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
});
