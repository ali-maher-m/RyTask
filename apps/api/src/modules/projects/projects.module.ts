import { Global, Module } from '@nestjs/common';
import { ProjectsController } from './controllers/projects.controller';
import { StatusesController } from './controllers/statuses.controller';
import { PROJECT_ACCESS } from './projects.contract';
import { ArchiveProjectProvider } from './providers/archive-project.provider';
import { CreateProjectProvider } from './providers/create-project.provider';
import { DeleteProjectProvider } from './providers/delete-project.provider';
import { GetProjectProvider } from './providers/get-project.provider';
import { ListProjectsProvider } from './providers/list-projects.provider';
import { MembershipProvider } from './providers/membership.provider';
import { StatusesProvider } from './providers/statuses.provider';
import { UpdateProjectProvider } from './providers/update-project.provider';
import { ProjectCountersRepository } from './repositories/project-counters.repository';
import { ProjectMembersRepository } from './repositories/project-members.repository';
import { ProjectsRepository } from './repositories/projects.repository';
import { StatusesRepository } from './repositories/statuses.repository';
import { ProjectAccessServiceImpl } from './services/project-access.service';
import { ProjectsService } from './services/projects.service';
import { StatusesService } from './services/statuses.service';

/**
 * Projects bounded context (data-model §4): owns `projects`, `project_members`,
 * `project_counters`, `statuses`. `@Global` so the cross-module `PROJECT_ACCESS`
 * authorization port is injectable everywhere via its token (consumers never import
 * this module's internals — Principle III). US3 adds status CRUD/reorder/delete-remap;
 * US4 adds project CRUD + membership management + archive/delete.
 */
@Global()
@Module({
  controllers: [ProjectsController, StatusesController],
  providers: [
    ProjectsRepository,
    ProjectMembersRepository,
    ProjectCountersRepository,
    StatusesRepository,
    CreateProjectProvider,
    ListProjectsProvider,
    GetProjectProvider,
    UpdateProjectProvider,
    ArchiveProjectProvider,
    DeleteProjectProvider,
    MembershipProvider,
    StatusesProvider,
    ProjectsService,
    StatusesService,
    ProjectAccessServiceImpl,
    { provide: PROJECT_ACCESS, useExisting: ProjectAccessServiceImpl },
  ],
  exports: [PROJECT_ACCESS],
})
export class ProjectsModule {}
