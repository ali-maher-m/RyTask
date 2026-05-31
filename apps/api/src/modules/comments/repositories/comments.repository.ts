import { Inject, Injectable } from '@nestjs/common';
import { type Database, comments } from '@rytask/db';
import { asc, eq, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type CommentRow = typeof comments.$inferSelect;

export interface CreateCommentData {
  workItemId: string;
  authorId: string;
  parentId?: string | null;
  body: string;
}

/**
 * Tenant-scoped reads/writes for `comments` (owned by the comments module, data-model
 * §4). Threaded via a nullable `parent_id` self-reference; markdown `body`; soft-delete
 * via `deleted_at` (D9). Default reads exclude deleted rows.
 */
@Injectable()
export class CommentsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert a comment (tenant-scoped). */
  async create(data: CreateCommentData): Promise<CommentRow> {
    const [row] = await this.db
      .insert(comments)
      .values({
        organizationId: this.tenant.getOrgId(),
        workItemId: data.workItemId,
        authorId: data.authorId,
        parentId: data.parentId ?? null,
        body: data.body,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert comment');
    }
    return row;
  }

  /** A single non-deleted comment by id (tenant-scoped), or null. */
  async findById(id: string): Promise<CommentRow | null> {
    const [row] = await this.db
      .select()
      .from(comments)
      .where(this.scoped(comments, eq(comments.id, id), isNull(comments.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** Chronological thread for a work item (tenant-scoped, non-deleted), oldest first. */
  async listForItem(workItemId: string): Promise<CommentRow[]> {
    return this.db
      .select()
      .from(comments)
      .where(this.scoped(comments, eq(comments.workItemId, workItemId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt));
  }
}
