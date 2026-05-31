import { Global, Module } from '@nestjs/common';
import { LabelsController } from './controllers/labels.controller';
import { WorkItemsController } from './controllers/work-items.controller';
import { AddLabelProvider } from './providers/add-label.provider';
import { AddSubtaskProvider } from './providers/add-subtask.provider';
import { CreateWorkItemProvider } from './providers/create-work-item.provider';
import { DeleteRestoreWorkItemProvider } from './providers/delete-restore-work-item.provider';
import { LabelsProvider } from './providers/labels.provider';
import { ListWorkItemsProvider } from './providers/list-work-items.provider';
import { MoveWorkItemProvider } from './providers/move-work-item.provider';
import { MyWorkProvider } from './providers/my-work.provider';
import { RemoveLabelProvider } from './providers/remove-label.provider';
import { UpdateWorkItemProvider } from './providers/update-work-item.provider';
import { ActivityRepository } from './repositories/activity.repository';
import { LabelsRepository } from './repositories/labels.repository';
import { WorkItemWatchersRepository } from './repositories/work-item-watchers.repository';
import { WorkItemsRepository } from './repositories/work-items.repository';
import { LabelsService } from './services/labels.service';
import { WorkItemAccessServiceImpl } from './services/work-item-access.service';
import { WorkItemsService } from './services/work-items.service';
import { WORK_ITEM_ACCESS } from './work-items.contract';

/**
 * Work-items bounded context (data-model §4): owns `work_items`, `labels`,
 * `work_item_labels`, `work_item_watchers`, `activity`, plus the quick-add grammar.
 * US1 wires capture (create + quick-add); US2 adds detail (update/delete/restore/activity/
 * labels); US3/US6 extend it further. `@Global` so the cross-module `WORK_ITEM_ACCESS`
 * port (watchers/activity/mention access — US7) is injectable by token everywhere without
 * other modules importing this one (Principle III; mirrors ProjectsModule's PROJECT_ACCESS).
 */
@Global()
@Module({
  controllers: [WorkItemsController, LabelsController],
  providers: [
    WorkItemsRepository,
    LabelsRepository,
    ActivityRepository,
    WorkItemWatchersRepository,
    CreateWorkItemProvider,
    UpdateWorkItemProvider,
    DeleteRestoreWorkItemProvider,
    MoveWorkItemProvider,
    ListWorkItemsProvider,
    MyWorkProvider,
    AddSubtaskProvider,
    AddLabelProvider,
    RemoveLabelProvider,
    LabelsProvider,
    WorkItemsService,
    LabelsService,
    WorkItemAccessServiceImpl,
    { provide: WORK_ITEM_ACCESS, useExisting: WorkItemAccessServiceImpl },
  ],
  exports: [WORK_ITEM_ACCESS],
})
export class WorkItemsModule {}
