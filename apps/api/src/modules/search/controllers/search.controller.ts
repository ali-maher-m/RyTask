import { Controller, Get, Query } from '@nestjs/common';
import { type SearchEnvelope, type SearchQuery, searchQuerySchema } from '@rytask/contracts';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SearchService } from '../services/search.service';

/**
 * Search REST surface under /api/v1 (contracts/openapi.yaml). `GET /search` — full-text
 * search across items/comments/projects/labels/users, tenant + permission scoped. RBAC:
 * `authenticated` (any signed-in principal); the result set is itself permission-scoped in
 * the provider, so no project role is required to call it. Returns the `{ data }` envelope.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  search(
    @Query(new ZodValidationPipe<SearchQuery>(searchQuerySchema)) query: SearchQuery,
  ): Promise<SearchEnvelope> {
    return this.service.search(query);
  }
}
