import { Module } from '@nestjs/common';
import { ViewsController } from './controllers/views.controller';
import { DeleteViewProvider } from './providers/delete-view.provider';
import { ListViewsProvider } from './providers/list-views.provider';
import { SaveViewProvider } from './providers/save-view.provider';
import { UpdateViewProvider } from './providers/update-view.provider';
import { ViewsRepository } from './repositories/views.repository';
import { ViewsService } from './services/views.service';

/**
 * Views bounded context (data-model §4): owns `views` (saved views) and the shared
 * filter AST → Drizzle query engine + smart-view registry (D6/D7). The query engine +
 * smart-view ASTs land in `domain/` (consumed by work-items via `views.contract.ts`);
 * US5 adds the saved-views CRUD surface (FR-VIEW-008).
 */
@Module({
  controllers: [ViewsController],
  providers: [
    ViewsRepository,
    ListViewsProvider,
    SaveViewProvider,
    UpdateViewProvider,
    DeleteViewProvider,
    ViewsService,
  ],
  // Exported for the MCP transport edge (M3, US4), which imports ViewsModule and dispatches to it.
  exports: [ViewsService],
})
export class ViewsModule {}
