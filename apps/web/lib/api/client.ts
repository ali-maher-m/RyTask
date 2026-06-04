'use client';

/**
 * Shared transport for the consolidated data layer (D8). Re-exports the low-level bearer +
 * silent-refresh helpers and session-token accessors from `./http` so every surface imports the
 * whole data layer from one place (`@/lib/api`). Resource modules build on `authedRequest` /
 * `publicRequest`; the retired M1 dev-header (`x-user-id`) is never reintroduced — the API
 * authenticates the `Authorization` bearer only (quickstart §6).
 */
export {
  API_BASE,
  ApiError,
  authedFetch,
  authedRequest,
  clearSession,
  getAccessToken,
  getRefreshToken,
  isSignedIn,
  publicRequest,
  storeSession,
} from './http';

/** Unwrap a single-resource envelope `{ data }` (some routes add `statusCode`/`message`). */
export interface ResourceEnvelope<T> {
  data: T;
}
