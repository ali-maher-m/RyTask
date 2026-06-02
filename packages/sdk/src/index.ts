import type { HealthStatus, Readiness } from '@rytask/contracts';
import type { components } from './generated';
import type { components as identityComponents } from './generated-identity';

/**
 * Typed RyTask SDK.
 *
 * The REST surface types are GENERATED from the OpenAPI contracts by `openapi-typescript`:
 * the M1 core work loop (`specs/001-core-work-loop/contracts/openapi.yaml` → `generated.ts`)
 * and the M0 identity/tenancy surface
 * (`specs/002-identity-tenancy-onboarding/contracts/openapi.yaml` → `generated-identity.ts`).
 * Regenerate with `pnpm --filter @rytask/sdk gen:sdk` whenever a contract changes; both
 * generated files are build artifacts — do not edit them by hand.
 */
export type { components, operations, paths } from './generated';
export type {
  components as identityComponents,
  operations as identityOperations,
  paths as identityPaths,
} from './generated-identity';

/** All response/request schema objects from the OpenAPI contract, keyed by name. */
export type Schemas = components['schemas'];

/** M0 identity/tenancy schema objects (auth, orgs, members, invites, tokens), keyed by name. */
export type IdentitySchemas = identityComponents['schemas'];

/** Convenience aliases for the M0 identity/tenancy DTOs (mirror `identityComponents.schemas`). */
export type AuthResult = IdentitySchemas['AuthResult'];
export type WhoAmI = IdentitySchemas['WhoAmI'];
export type Organization = IdentitySchemas['Organization'];
export type Membership = IdentitySchemas['Membership'];
export type Invitation = IdentitySchemas['Invitation'];
export type ApiToken = IdentitySchemas['ApiToken'];
export type ApiTokenSecret = IdentitySchemas['ApiTokenSecret'];

/** JSON body of a named OpenAPI response component (e.g. `WorkItemEnvelope`). */
export type ResponseJson<Name extends keyof components['responses']> =
  components['responses'][Name] extends { content: { 'application/json': infer B } } ? B : never;

/** Convenience aliases for the M1 domain DTOs (mirror `components.schemas`). */
export type Project = Schemas['Project'];
export type CreateProject = Schemas['CreateProject'];
export type UpdateProject = Schemas['UpdateProject'];
export type AddMember = Schemas['AddMember'];
export type Status = Schemas['Status'];
export type CreateStatus = Schemas['CreateStatus'];
export type WorkItem = Schemas['WorkItem'];
export type CreateWorkItem = Schemas['CreateWorkItem'];
export type UpdateWorkItem = Schemas['UpdateWorkItem'];
export type MoveWorkItem = Schemas['MoveWorkItem'];
export type Comment = Schemas['Comment'];
export type CreateComment = Schemas['CreateComment'];
export type Label = Schemas['Label'];
export type View = Schemas['View'];
export type SaveView = Schemas['SaveView'];
export type ActivityEntry = Schemas['ActivityEntry'];
export type SearchResult = Schemas['SearchResult'];
export type Notification = Schemas['Notification'];
export type ErrorEnvelope = Schemas['ErrorEnvelope'];
export type PageInfo = Schemas['PageInfoEnvelope']['pageInfo'];

/**
 * Minimal fetch shape so the SDK stays free of DOM lib typings and runs in Node,
 * the browser, and tests alike.
 */
type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface RytaskClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: FetchLike;
}

export class RytaskClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: RytaskClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const fetchImpl = options.fetchImpl ?? globalFetch;
    if (!fetchImpl) {
      throw new Error('No fetch implementation available; pass options.fetchImpl');
    }
    this.fetchImpl = fetchImpl;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(
        body === undefined ? undefined : { 'content-type': 'application/json' },
      ),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${method} ${path} failed with ${res.status}`);
    }
    return (await res.json()) as T;
  }

  // ── health (M0) ───────────────────────────────────────────────────────────────
  health(): Promise<HealthStatus> {
    return this.request<HealthStatus>('GET', '/healthz');
  }

  readiness(): Promise<Readiness> {
    return this.request<Readiness>('GET', '/readyz');
  }

  // ── work items (M1, types generated from the OpenAPI contract) ──────────────────
  createWorkItem(body: CreateWorkItem): Promise<ResponseJson<'WorkItemEnvelope'>> {
    return this.request('POST', '/work-items', body);
  }

  listProjects(): Promise<ResponseJson<'ProjectListEnvelope'>> {
    return this.request('GET', '/projects');
  }
}
