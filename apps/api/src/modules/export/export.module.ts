import { Module } from '@nestjs/common';
import { ExportController } from './controllers/export.controller';
import { WorkspaceExportProvider } from './providers/workspace-export.provider';
import { ExportRepository } from './repositories/export.repository';

/**
 * Portability bounded module (M5, FR-PORT-003/004 — "no lock-in; safe exit/backup", BRD F17).
 * A pure READ surface: one read-model repository over the shared schema (the M4 reporting
 * precedent — it owns no tables, writes nothing), one assembling provider, one OWNER/ADMIN
 * controller. CSV serialization is a pure domain function; no new dependency.
 */
@Module({
  controllers: [ExportController],
  providers: [ExportRepository, WorkspaceExportProvider],
})
export class ExportModule {}
