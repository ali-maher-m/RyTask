import type { ModuleTestPlan } from '../../common/testing/testplan';

/** REQUIRED tests for the notifications module (§14.2). Appended in US7 (incl. the BullMQ processor). */
export const testPlan: ModuleTestPlan = {
  module: 'notifications',
  providers: [
    'InboxProvider',
    'NotificationsDispatchProcessor',
    'DueScanProcessor',
    'NotificationsQueue',
    'NotificationsSubscriber',
    'NotificationsService',
  ],
  controllers: [
    {
      controller: 'NotificationsController',
      routes: [
        'GET /notifications',
        'GET /notifications/unread-count',
        'PATCH /notifications/{id}',
      ],
    },
  ],
  policies: ['dedupe.policy'],
  mcpTools: ['list_notifications', 'update_notification'],
  tenantScopedTables: ['notifications'],
  requiredTests: [
    // US7 — dedupe policy + dispatch + inbox + tenancy + contract
    { kind: 'unit', target: 'dedupe.policy', file: 'domain/dedupe.policy.spec.ts' },
    {
      kind: 'processor',
      target: 'NotificationsDispatchProcessor',
      file: 'processors/notifications.dispatch.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'InboxProvider',
      file: 'providers/inbox.provider.int.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'notifications',
      file: 'repositories/notifications.tenancy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'NotificationsController',
      file: 'controllers/notifications.controller.contract.spec.ts',
    },
    {
      kind: 'unit',
      target: 'NotificationsSubscriber',
      file: 'processors/notifications.subscriber.spec.ts',
    },
    {
      kind: 'unit',
      target: 'DueScanProcessor',
      file: 'processors/due-scan.processor.spec.ts',
    },
  ],
};

export default testPlan;
