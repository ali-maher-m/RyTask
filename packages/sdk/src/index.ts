import type { HealthStatus, Readiness } from '@rytask/contracts';

/**
 * Hand-written placeholder client. M1 replaces this with a client generated from
 * the OpenAPI spec in @rytask/contracts (see `gen:sdk`). The `FetchLike` shape keeps
 * the SDK free of DOM lib typings so it runs in Node, the browser, and tests alike.
 */
type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
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

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
    });
    if (!res.ok) {
      throw new Error(`GET ${path} failed with ${res.status}`);
    }
    return (await res.json()) as T;
  }

  health(): Promise<HealthStatus> {
    return this.get<HealthStatus>('/healthz');
  }

  readiness(): Promise<Readiness> {
    return this.get<Readiness>('/readyz');
  }
}
