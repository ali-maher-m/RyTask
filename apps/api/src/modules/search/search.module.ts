import { Module } from '@nestjs/common';
import { SearchController } from './controllers/search.controller';
import { SearchProvider } from './providers/search.provider';
import { SearchRepository } from './repositories/search.repository';
import { SearchService } from './services/search.service';

/**
 * Search bounded context (data-model §4): READ-ONLY over the `work_items` and `comments`
 * tsvectors plus the projects/labels/users sets — it owns NO tables (the documented
 * exception). Permission-aware: every read is tenant-scoped and intersected with the
 * principal's accessible projects via the @Global `PROJECT_ACCESS` port (injected by
 * token; this module never imports ProjectsModule — Principle III). Filled in US8.
 */
@Module({
  controllers: [SearchController],
  providers: [SearchRepository, SearchProvider, SearchService],
})
export class SearchModule {}
