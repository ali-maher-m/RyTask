import { Module } from '@nestjs/common';
import { CommentsController } from './controllers/comments.controller';
import { CreateCommentProvider } from './providers/create-comment.provider';
import { ListCommentsProvider } from './providers/list-comments.provider';
import { CommentsRepository } from './repositories/comments.repository';
import { CommentsService } from './services/comments.service';

/**
 * Comments bounded context (data-model §4): owns `comments` (threaded markdown +
 * @mention parsing, D9). Consumes the `WORK_ITEM_ACCESS` port (from the @Global
 * WorkItemsModule) — the only sanctioned way to touch `work_item_watchers` / `activity`
 * (owned by work-items) and the mention parser (Principle III). The token is injected by
 * symbol; this module never imports work-items' module. Populated in US7.
 */
@Module({
  controllers: [CommentsController],
  providers: [CommentsRepository, CreateCommentProvider, ListCommentsProvider, CommentsService],
  // Exported for the MCP transport edge (M3, US4), which imports CommentsModule and dispatches to it.
  exports: [CommentsService],
})
export class CommentsModule {}
