import type { ModuleTestPlan } from '../../common/testing/testplan';

/** REQUIRED tests for the comments module (§14.2). Appended in US7. */
export const testPlan: ModuleTestPlan = {
  module: 'comments',
  providers: ['CreateCommentProvider', 'ListCommentsProvider', 'CommentsService'],
  controllers: [
    {
      controller: 'CommentsController',
      routes: ['GET /work-items/{id}/comments', 'POST /work-items/{id}/comments'],
    },
  ],
  policies: [],
  mcpTools: ['list_comments', 'add_comment'],
  tenantScopedTables: ['comments'],
  requiredTests: [
    // US7 — comments (threaded markdown + @mentions, D9)
    {
      kind: 'integration',
      target: 'CreateCommentProvider',
      file: 'providers/create-comment.provider.int.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'comments/work_item_watchers',
      file: 'repositories/comments.tenancy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'CommentsController',
      file: 'controllers/comments.controller.contract.spec.ts',
    },
  ],
};

export default testPlan;
