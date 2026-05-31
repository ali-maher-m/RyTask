/**
 * The authenticated principal (FR-AUTH). M0 verifies a JWT/PAT and resolves this
 * server-side; M1 consumes it (research D0). It is the ONLY source of tenant + identity
 * — never read org/user from a request body or query (Principle II).
 */
export interface Principal {
  userId: string;
  organizationId: string;
  workspaceId?: string;
  /** Org-level admin/owner (from M0 org RBAC) — bypasses project-role checks. */
  isOrgAdmin?: boolean;
}

/** Request augmented with the resolved principal (set by the context middleware). */
export interface RequestWithPrincipal {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
}

const header = (req: RequestWithPrincipal, name: string): string | undefined => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * M1 DEV/TEST principal resolution from headers. **Temporary seam** — M0 replaces this
 * with real JWT/PAT verification. It is only reachable while `AuthGuard` is a permissive
 * stub; once M0 rejects unauthenticated requests, untrusted headers never get here.
 */
export function resolveDevPrincipal(req: RequestWithPrincipal): Principal | undefined {
  const userId = header(req, 'x-user-id');
  const organizationId = header(req, 'x-organization-id');
  if (!userId || !organizationId) {
    return undefined;
  }
  return {
    userId,
    organizationId,
    workspaceId: header(req, 'x-workspace-id'),
    isOrgAdmin: header(req, 'x-org-admin') === 'true',
  };
}
