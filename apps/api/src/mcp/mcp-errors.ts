import { HttpException } from '@nestjs/common';

/**
 * MCP error categories (M3, FR-MCP-004, research D12). Domain exceptions are mapped to three
 * stable codes the agent can act on; everything else is INTERNAL. No partial mutation on error —
 * the underlying services are transactional.
 */
export type McpErrorCode =
  | 'INVALID_ARGUMENT'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

/** A categorized error surfaced to the MCP client (code + plain human message). */
export class McpToolError extends Error {
  constructor(
    readonly code: McpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

/** Is this a zod validation failure? Detected structurally so the edge needn't import zod. */
function isZodError(err: unknown): boolean {
  return err instanceof Error && err.name === 'ZodError';
}

/**
 * Map any thrown value to a categorized {@link McpToolError}. Already-categorized errors pass
 * through; zod failures and Nest `BadRequestException` (400) → INVALID_ARGUMENT; 401/403 →
 * PERMISSION_DENIED; 404 → NOT_FOUND; 409 → CONFLICT; anything else → INTERNAL.
 */
export function toMcpError(err: unknown): McpToolError {
  if (err instanceof McpToolError) {
    return err;
  }
  if (isZodError(err)) {
    return new McpToolError('INVALID_ARGUMENT', (err as Error).message);
  }
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const message = err.message;
    switch (status) {
      case 400:
      case 422:
        return new McpToolError('INVALID_ARGUMENT', message);
      case 401:
      case 403:
        return new McpToolError('PERMISSION_DENIED', message);
      case 404:
        return new McpToolError('NOT_FOUND', message);
      case 409:
        return new McpToolError('CONFLICT', message);
      default:
        return new McpToolError('INTERNAL', message);
    }
  }
  return new McpToolError('INTERNAL', err instanceof Error ? err.message : 'internal error');
}
