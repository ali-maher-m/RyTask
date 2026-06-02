import { Inject, Injectable } from '@nestjs/common';
import { type Database, type User, users } from '@rytask/db';
import { eq, inArray } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export interface CreateUserColumns {
  organizationId: string;
  email: string;
  name: string;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
}

/**
 * Auth-aware access over `users` (data-model §2.2). `users` is the **global identity**
 * exception to tenant scoping (research D1) — `findByEmail`/`findById` are by global key
 * so the pre-context login / register / password-reset paths (no ALS yet) can resolve a
 * user. Email is unique per `(org, email)`; M0 is single-org in practice (FR-TEN-003).
 */
@Injectable()
export class UsersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Global find-by-email (identity exception; used by login/register/reset before ALS). */
  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  }

  /** Global find-by-id (PK). */
  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  /** Global find-by-ids (PKs) — for hydrating a member list (US8). */
  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.db.select().from(users).where(inArray(users.id, ids));
  }

  /** Insert a user (org explicit — bootstrap/register run before ALS). */
  async create(data: CreateUserColumns): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        organizationId: data.organizationId,
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash ?? null,
        emailVerifiedAt: data.emailVerifiedAt ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('failed to create user');
    }
    return row;
  }

  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async markEmailVerified(id: string, at: Date): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerifiedAt: at, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  /** Set/clear the deactivation marker (member removal/reactivation, US8). */
  async setDeactivated(id: string, at: Date | null): Promise<void> {
    await this.db
      .update(users)
      .set({ deactivatedAt: at, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
}
