import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@rytask/db';
import { sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';

/**
 * System-level DB check (not tenant-scoped — this is infrastructure readiness, not
 * tenant data). Lives in repositories/ so it is the only place allowed to touch the DB.
 */
@Injectable()
export class HealthRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }
}
