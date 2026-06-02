import type {
  Invitation,
  Membership,
  OrgSettings,
  Organization,
  Role,
  UserSummary,
  Workspace,
} from '@rytask/contracts';

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

/** An `invitations` row shape (structural — no @rytask/db import in providers/). */
export interface InvitationRowLike {
  id: string;
  email: string | null;
  role: Role;
  invitedByUserId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

/** Map an invitation row to the public `Invitation` DTO (the token hash is never exposed). */
export const toInvitationDto = (row: InvitationRowLike): Invitation => ({
  id: row.id,
  email: row.email,
  role: row.role,
  invitedByUserId: row.invitedByUserId,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

/** A `memberships` row shape (structural — no @rytask/db import in providers/). */
export interface MembershipRowLike {
  userId: string;
  role: Role;
  deactivatedAt: Date | null;
}

/** Map a membership row + the member's user summary to the public `Membership` DTO. */
export const toMembershipDto = (row: MembershipRowLike, user: UserSummary): Membership => ({
  userId: row.userId,
  user,
  role: row.role,
  deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
});
