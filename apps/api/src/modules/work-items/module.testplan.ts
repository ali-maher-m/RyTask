import type { ModuleTestPlan } from '../../common/testing/testplan';

/** REQUIRED tests for the work-items module (§14.2). Appended per user story (US1, US2, US3, US6). */
export const testPlan: ModuleTestPlan = {
  module: 'work-items',
  providers: [
    'CreateWorkItemProvider',
    'UpdateWorkItemProvider',
    'DeleteRestoreWorkItemProvider',
    'MoveWorkItemProvider',
    'ListWorkItemsProvider',
    'MyWorkProvider',
    'AddSubtaskProvider',
    'AddLabelProvider',
    'RemoveLabelProvider',
    'LabelsProvider',
    'WorkItemsService',
    'LabelsService',
  ],
  controllers: [
    {
      controller: 'WorkItemsController',
      routes: [
        'GET /work-items',
        'GET /work-items/{id}',
        'POST /work-items',
        'PATCH /work-items/{id}',
        'DELETE /work-items/{id}',
        'POST /work-items/{id}/restore',
        'POST /work-items/{id}/move',
        'GET /work-items/{id}/activity',
        'GET /work-items/{id}/subtasks',
        'POST /work-items/{id}/subtasks',
        'POST /work-items/{id}/labels',
        'DELETE /work-items/{id}/labels/{labelId}',
      ],
    },
    { controller: 'LabelsController', routes: ['GET /labels', 'POST /labels'] },
  ],
  policies: [
    'quick-add.parser',
    'activity-diff.policy',
    'markdown',
    'hierarchy.policy',
    'overdue.policy',
  ],
  mcpTools: [
    'create_issue',
    'quick_add_issue',
    'update_issue',
    'delete_issue',
    'restore_issue',
    'move_issue',
    'add_subtask',
    'list_issues',
    'get_issue',
    'add_label_to_issue',
    'remove_label_from_issue',
    'list_issue_activity',
    'list_labels',
    'create_label',
  ],
  tenantScopedTables: [
    'work_items',
    'labels',
    'work_item_labels',
    'work_item_watchers',
    'activity',
  ],
  requiredTests: [
    // US1 — capture
    { kind: 'unit', target: 'quick-add.parser', file: 'domain/quick-add.parser.spec.ts' },
    {
      kind: 'integration',
      target: 'CreateWorkItemProvider',
      file: 'providers/create-work-item.provider.int.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'work_items/activity/counters',
      file: 'repositories/work-items.tenancy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'WorkItemsController',
      file: 'controllers/work-items.controller.contract.spec.ts',
    },
    // US2 — detail
    { kind: 'unit', target: 'activity-diff.policy', file: 'domain/activity-diff.policy.spec.ts' },
    { kind: 'unit', target: 'markdown', file: 'domain/markdown.spec.ts' },
    {
      kind: 'integration',
      target: 'UpdateWorkItemProvider',
      file: 'providers/update-work-item.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'DeleteRestoreWorkItemProvider',
      file: 'providers/delete-restore-work-item.provider.int.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'labels/work_item_labels',
      file: 'repositories/labels.tenancy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'LabelsController',
      file: 'controllers/labels.controller.contract.spec.ts',
    },
    // US3 — board move + list/board read path over the shared query engine
    {
      kind: 'integration',
      target: 'MoveWorkItemProvider',
      file: 'providers/move-work-item.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'ListWorkItemsProvider',
      file: 'providers/list-work-items.provider.int.spec.ts',
    },
    // US4 — cross-project My Work (assignee=me ∩ accessible projects) over the shared list path
    {
      kind: 'integration',
      target: 'MyWorkProvider',
      file: 'providers/my-work.provider.int.spec.ts',
    },
    // US6 — sub-tasks + scheduling/overdue (FR-HIER-001, FR-DATE-003)
    { kind: 'unit', target: 'hierarchy.policy', file: 'domain/hierarchy.policy.spec.ts' },
    { kind: 'unit', target: 'overdue.policy', file: 'domain/overdue.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'AddSubtaskProvider',
      file: 'providers/add-subtask.provider.int.spec.ts',
    },
    // The flagship create → track → view e2e lives in apps/web (US1+US2+US3); the
    // work-items module owns the board-move flow, so it declares the spec here.
    {
      kind: 'e2e',
      target: 'create-track-view (board flow)',
      file: '../../../../web/e2e/create-track-view.e2e.spec.ts',
    },
  ],
};

export default testPlan;
