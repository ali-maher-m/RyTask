import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CreateLabel, Label } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { LabelsRepository } from '../repositories/labels.repository';

/**
 * Workspace-label create/list (GET|POST /labels, FR-LBL-001, D14). Labels are
 * workspace-scoped (not under a project), so access is gated on an authenticated
 * principal within the tenant; the repository enforces org+workspace isolation.
 */
@Injectable()
export class LabelsProvider {
  constructor(
    private readonly labels: LabelsRepository,
    private readonly tenant: TenantContextService,
  ) {}

  private requireUser(): void {
    if (!this.tenant.getUserId()) {
      throw new UnauthorizedException('No authenticated principal');
    }
  }

  async list(): Promise<Label[]> {
    this.requireUser();
    const rows = await this.labels.list();
    return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
  }

  async create(input: CreateLabel): Promise<Label> {
    this.requireUser();
    const row = await this.labels.create(input.name, input.color);
    return { id: row.id, name: row.name, color: row.color };
  }
}
