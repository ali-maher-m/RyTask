import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type CommentEnvelope,
  type CommentListResponse,
  type CreateComment,
  createCommentSchema,
} from '@rytask/contracts';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { CommentsService } from '../services/comments.service';

/**
 * Comments REST surface under /api/v1 (contracts/openapi.yaml). Threaded markdown
 * comments on a work item; @mentions notify and grant context access (handled in the
 * provider). RBAC is enforced in the providers via the project access port; the
 * tenant/principal is resolved server-side, never from the body. A retry carrying the same
 * `Idempotency-Key` replays the first response instead of posting a duplicate comment.
 */
@RequirePermission('work:read')
@Controller('work-items/:itemId/comments')
export class CommentsController {
  constructor(
    private readonly service: CommentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  list(@Param('itemId', new ParseUUIDPipe()) itemId: string): Promise<CommentListResponse> {
    return this.service.list(itemId);
  }

  @RequirePermission('work:write')
  @Post()
  @HttpCode(201)
  create(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body(new ZodValidationPipe<CreateComment>(createCommentSchema)) body: CreateComment,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CommentEnvelope> {
    return this.idempotency.run(idempotencyKey, `comments.create:${itemId}`, () =>
      this.service.create(itemId, body),
    );
  }
}
