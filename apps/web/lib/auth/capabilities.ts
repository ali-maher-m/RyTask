import type { ProjectRoleDto, Role } from '@rytask/contracts';

/**
 * Client capability map (D9, role-capability-matrix.md). Mirrors the M0 RBAC matrix so the UI can
 * hide/disable controls a role cannot use — a usability courtesy, NEVER the real control. The
 * server's default-deny RbacGuard is authoritative (Principle VI); every hidden/edge action that
 * still reaches the server is reconciled gracefully (403/409 → revert + kind message — FR-WEB-100).
 */
export type Capability =
  | 'org:read'
  | 'members:read'
  | 'comment:write'
  | 'tokens:write'
  | 'workitem:write'
  | 'project:create'
  | 'project:admin'
  | 'org:settings:write'
  | 'members:invite'
  | 'members:write'
  | 'integrations:admin'
  | 'org:transfer'
  | 'org:delete';

export interface CapabilityCtx {
  /** The principal's role within the project being acted on (if any). */
  projectRole?: ProjectRoleDto;
  /** For members:write — the role of the member being acted on. */
  targetRole?: Role;
  /** For members:write — true when the target is the only OWNER (demote/remove disabled). */
  isLastOwner?: boolean;
}

function isOrgAdmin(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/** Does `role` satisfy `cap` (given optional context)? Default-deny: anything unlisted is false. */
export function can(role: Role, cap: Capability, ctx: CapabilityCtx = {}): boolean {
  switch (cap) {
    case 'org:read':
      return true;
    case 'members:read':
      return role !== 'GUEST';
    case 'comment:write':
      // Allowed for everyone the org's comment toggle permits (incl. VIEWER); server enforces.
      return true;
    case 'tokens:write':
      // Every member can manage their own PATs.
      return true;
    case 'workitem:write':
      if (isOrgAdmin(role)) return true;
      if (role === 'MEMBER') return ctx.projectRole === 'ADMIN' || ctx.projectRole === 'MEMBER';
      return false; // GUEST, VIEWER
    case 'project:create':
      return role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
    case 'project:admin':
      if (isOrgAdmin(role)) return true;
      if (role === 'MEMBER') return ctx.projectRole === 'ADMIN';
      return false;
    case 'org:settings:write':
      return isOrgAdmin(role);
    case 'integrations:admin':
      // Connect / disconnect / map Slack — owners and admins only (mirrors org:settings:write).
      return isOrgAdmin(role);
    case 'members:invite':
      return isOrgAdmin(role);
    case 'members:write': {
      if (ctx.isLastOwner) return false; // no actor can demote/remove the last OWNER
      if (role === 'OWNER') return true;
      if (role === 'ADMIN') return ctx.targetRole !== 'OWNER'; // ADMIN can't act on an OWNER
      return false;
    }
    case 'org:transfer':
      return role === 'OWNER';
    case 'org:delete':
      return role === 'OWNER';
    default:
      return false;
  }
}

const REASONS: Record<Capability, string> = {
  'org:read': '',
  'members:read': 'Guests can’t see the members list.',
  'comment:write': 'Commenting is turned off for your role.',
  'tokens:write': '',
  'workitem:write': 'You need edit access to this project to change work.',
  'project:create': 'Only owners, admins, and members can create projects.',
  'project:admin': 'Only a project admin can change project settings.',
  'org:settings:write': 'Only owners and admins can change organization settings.',
  'integrations:admin': 'Only owners and admins can manage integrations.',
  'members:invite': 'Only owners and admins can invite teammates.',
  'members:write': 'You can’t change this person’s role.',
  'org:transfer': 'Only the owner can transfer ownership.',
  'org:delete': 'Only the owner can delete the organization.',
};

/** A kind, plain-language explanation of why a control is disabled (shown in a Tooltip). */
export function reason(cap: Capability): string {
  return REASONS[cap] ?? 'You don’t have permission for this.';
}
