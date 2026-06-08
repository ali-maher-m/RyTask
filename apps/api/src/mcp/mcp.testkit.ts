import type { Principal } from '../common/auth/principal';
import { TenantContextService } from '../common/tenancy/tenant-context.service';
import { type McpSessionContext, createSession } from './mcp-session';
import type { ContextTools } from './tools/context-tools';
import { McpToolDispatcher } from './tools/tool-dispatch';
import { McpToolRegistrar } from './tools/tool-wiring';

/**
 * Lightweight harness for the MCP per-tool contract tests (M3, US4). It builds a REAL dispatcher +
 * registrar wired to MOCK services — no Nest, no DB — so the unit suite can assert each tool's I/O
 * contract: validate → RBAC (scope ∩ role) → dispatch → unwrapped DTO, and the categorized errors
 * (INVALID_ARGUMENT / PERMISSION_DENIED / NOT_FOUND). Pass only the service mocks a spec exercises;
 * the rest are inert stubs (their tools simply aren't called).
 */
export interface ServiceMocks {
  context?: Partial<ContextTools>;
  workItems?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  projects?: Record<string, unknown>;
  statuses?: Record<string, unknown>;
  views?: Record<string, unknown>;
  comments?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  search?: Record<string, unknown>;
  orgs?: Record<string, unknown>;
  members?: Record<string, unknown>;
  invites?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
}

const stub = (): Record<string, unknown> => ({});

/** Build a dispatcher with all 49 handlers registered against the given service mocks. */
export function buildDispatcher(mocks: ServiceMocks = {}): McpToolDispatcher {
  const tenant = new TenantContextService();
  const dispatcher = new McpToolDispatcher(tenant);
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally shaped per-spec.
  const cast = (m: unknown): any => (m ?? stub()) as any;
  const registrar = new McpToolRegistrar(
    dispatcher,
    cast(mocks.context),
    cast(mocks.workItems),
    cast(mocks.labels),
    cast(mocks.projects),
    cast(mocks.statuses),
    cast(mocks.views),
    cast(mocks.comments),
    cast(mocks.notifications),
    cast(mocks.search),
    cast(mocks.orgs),
    cast(mocks.members),
    cast(mocks.invites),
    cast(mocks.tokens),
  );
  registrar.onModuleInit();
  return dispatcher;
}

/** A session for a PAT principal. Defaults to OWNER + wildcard scope (all tools permitted). */
export function makeSession(overrides: Partial<Principal> = {}): McpSessionContext {
  return createSession({
    userId: '0193b3a0-0000-7000-8000-000000000003',
    organizationId: '0193b3a0-0000-7000-8000-000000000001',
    workspaceId: '0193b3a0-0000-7000-8000-000000000002',
    role: 'OWNER',
    isOrgAdmin: true,
    scopes: ['*'],
    isApiToken: true,
    ...overrides,
  });
}

/** Dispatch and capture the thrown {@link McpToolError} code (or 'OK' when it resolves). */
export async function dispatchError(
  dispatcher: McpToolDispatcher,
  session: McpSessionContext,
  name: string,
  args: unknown,
): Promise<string> {
  try {
    await dispatcher.dispatch(session, name, args);
    return 'OK';
  } catch (err) {
    return (err as { code?: string }).code ?? 'UNKNOWN';
  }
}
