import { Injectable } from '@nestjs/common';
import type { CreateLabel, Label, LabelListResponse } from '@rytask/contracts';
import { LabelsProvider } from '../providers/labels.provider';

/**
 * Labels application service (FR-LBL-001, D14) — the public surface for workspace-label
 * list/create. Controllers + (future) MCP tools call this; no parallel logic.
 */
@Injectable()
export class LabelsService {
  constructor(private readonly provider: LabelsProvider) {}

  async list(): Promise<LabelListResponse> {
    return { data: await this.provider.list() };
  }

  async create(input: CreateLabel): Promise<{ data: Label }> {
    return { data: await this.provider.create(input) };
  }
}
