/**
 * Public surface of the projects module (Principle III). Other modules depend ONLY on
 * this file (never on projects' repositories/services). The module is `@Global`, so
 * consumers inject the tokens below without importing the module.
 */

export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

/** Role hierarchy: ADMIN ⊇ MEMBER ⊇ VIEWER. */
const RANK: Record<ProjectRole, number> = { VIEWER: 1, MEMBER: 2, ADMIN: 3 };

/** Pure: does `held` satisfy the `required` role? */
export const roleSatisfies = (held: ProjectRole, required: ProjectRole): boolean =>
  RANK[held] >= RANK[required];

/** DI token for the cross-module project access service. */
export const PROJECT_ACCESS = Symbol('PROJECT_ACCESS');

/**
 * Authorization surface for projects (the RBAC matrix in contracts/README.md). All
 * write providers call `assertRole`; reads call `assertRole(_, 'VIEWER')`. Org admins
 * bypass project membership.
 */
export interface ProjectAccessService {
  /** The current principal's role in the project, or null if not a member. */
  getRole(projectId: string): Promise<ProjectRole | null>;
  /** Throws ForbiddenException unless the current principal meets `required`. */
  assertRole(projectId: string, required: ProjectRole): Promise<void>;
  /** Project ids the current principal can access (My Work / search intersection). */
  accessibleProjectIds(): Promise<string[]>;
}
