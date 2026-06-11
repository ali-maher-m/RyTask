import path from 'node:path';
import { createOpenAPI } from 'fumadocs-openapi/server';

/**
 * The REST contract documents. The M0/M1 OpenAPI files are the committed contract
 * artifacts for the DTOs in packages/contracts; the M2/M3 document is authored here
 * (apps/docs/openapi/) and verified against the live controllers in apps/api.
 */
export const openapi = createOpenAPI({
  input: [
    path.resolve(
      process.cwd(),
      '../../specs/002-identity-tenancy-onboarding/contracts/openapi.yaml',
    ),
    path.resolve(process.cwd(), '../../specs/001-core-work-loop/contracts/openapi.yaml'),
    path.resolve(process.cwd(), 'openapi/time-slack-mcp.yaml'),
  ],
});
