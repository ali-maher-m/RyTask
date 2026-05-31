import { FIELD_REGISTRY, type FilterNode, type Operator, isGroup } from './filter.ast';

/** Thrown on an invalid filter AST; the controller maps it to HTTP 400. */
export class FilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterValidationError';
  }
}

/**
 * Validate a filter AST against the typed field registry (filter-dsl.md). Rejects
 * unknown fields and operators not permitted for a field; recurses into groups.
 */
export function validateFilter(node: FilterNode): void {
  if (!node || typeof node !== 'object') {
    throw new FilterValidationError('filter node must be an object');
  }

  if (isGroup(node)) {
    if (!Array.isArray(node.conditions)) {
      throw new FilterValidationError('a filter group requires a conditions[] array');
    }
    for (const child of node.conditions) {
      validateFilter(child);
    }
    return;
  }

  const { field, operator } = node as { field?: string; operator?: Operator };
  const allowed = field ? FIELD_REGISTRY[field as keyof typeof FIELD_REGISTRY] : undefined;
  if (!allowed) {
    throw new FilterValidationError(`unknown filter field: ${String(field)}`);
  }
  if (!operator || !(allowed as readonly string[]).includes(operator)) {
    throw new FilterValidationError(
      `operator "${String(operator)}" is not allowed for field "${field}"`,
    );
  }
}
