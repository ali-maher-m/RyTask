import { BadRequestException, Controller, Get, Header, Query, Res } from '@nestjs/common';
import { EXPORT_CSV_ENTITIES, type WorkspaceExportDto } from '@rytask/contracts';
import type { Response } from 'express';
import { RequirePermission, Roles } from '../../../common/rbac/decorators';
import { timeLogsCsv, workItemsCsv } from '../domain/export-csv';
import { WorkspaceExportProvider } from '../providers/workspace-export.provider';

/**
 * Full workspace data export (M5, FR-PORT-003/004, AC-12). OWNER/ADMIN only (`@Roles` — FR-PORT-004
 * "Owner triggers export"; ADMIN included for v1 practicality): a whole-tenant archive is more
 * than `work:read`, so MEMBER/GUEST/VIEWER get 403. Read-only by contract — no writes, no
 * activity, no notifications. `Content-Disposition: attachment` so a browser hit downloads a
 * dated file; the web Settings card fetches + saves the same responses client-side.
 *
 *   GET /export/workspace                                  → complete JSON archive
 *   GET /export/workspace?format=csv&entity=work-items     → items as CSV
 *   GET /export/workspace?format=csv&entity=time-logs      → time logs as CSV
 */
@Controller('export')
export class ExportController {
  constructor(private readonly exporter: WorkspaceExportProvider) {}

  @Roles('OWNER', 'ADMIN')
  @RequirePermission('org:read')
  @Get('workspace')
  @Header('cache-control', 'no-store')
  async exportWorkspace(
    @Res({ passthrough: true }) res: Response,
    @Query('format') format?: string,
    @Query('entity') entity?: string,
  ): Promise<WorkspaceExportDto | string> {
    const archive = await this.exporter.export();
    const stamp = archive.exportedAt.slice(0, 10);

    if (format === undefined || format === 'json') {
      res.setHeader('content-disposition', attachment(`rytask-export-${stamp}.json`));
      return archive;
    }
    if (format !== 'csv') {
      throw new BadRequestException("format must be 'json' or 'csv'");
    }
    if (entity === 'work-items') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', attachment(`rytask-work-items-${stamp}.csv`));
      return workItemsCsv(archive.workItems);
    }
    if (entity === 'time-logs') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', attachment(`rytask-time-logs-${stamp}.csv`));
      return timeLogsCsv(archive.timeLogs);
    }
    throw new BadRequestException(`entity must be one of: ${EXPORT_CSV_ENTITIES.join(', ')}`);
  }
}

const attachment = (filename: string): string => `attachment; filename="${filename}"`;
