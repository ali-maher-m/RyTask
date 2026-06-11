/**
 * Consolidated web data layer (D8). One module per resource, all built on the existing bearer +
 * silent-refresh helpers (`lib/api.ts`) and typed against `@rytask/contracts`. Feature surfaces
 * import from `@/lib/api` rather than scattered per-route clients.
 */
export * from './client';
export * from './errors';
export * from './auth';
export * from './org';
export * from './projects';
export * from './statuses';
export * from './labels';
export * from './work-items';
export * from './views';
export * from './members';
export * from './tokens';
export * from './invites';
export * from './comments';
export * from './notifications';
export * from './search';
export * from './slack';
export * from './github';
export * from './export';
export * from './mcp';
