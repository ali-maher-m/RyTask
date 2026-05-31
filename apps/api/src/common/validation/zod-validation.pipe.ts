import { BadRequestException, type PipeTransform } from '@nestjs/common';

/**
 * Minimal structural view of a schema's `safeParse`. Typing the pipe against THIS
 * (instead of Zod's `ZodTypeAny`) keeps `tsc` from deeply instantiating heavy
 * `.strict()` schema types (TS2589) while still accepting any Zod schema at the call
 * site. The single source of DTO truth remains `@rytask/contracts`.
 */
interface ValidationIssue {
  path: Array<string | number>;
  message: string;
}

export interface SchemaLike<TOut> {
  safeParse(
    value: unknown,
  ): { success: true; data: TOut } | { success: false; error: { issues: ValidationIssue[] } };
}

/**
 * Validates a value against a schema; unknown fields are rejected by `.strict()`
 * schemas → 400 (contracts/README.md). Bound per body/query in controllers.
 */
export class ZodValidationPipe<TOut> implements PipeTransform {
  constructor(private readonly schema: SchemaLike<TOut>) {}

  transform(value: unknown): TOut {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      );
    }
    return result.data;
  }
}
