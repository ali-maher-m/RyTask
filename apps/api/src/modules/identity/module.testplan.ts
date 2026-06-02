import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the identity module (§14.2, Principle V). Following the repo
 * convention (cf. the projects testplan), `requiredTests` is appended per user story so the
 * presence-gate stays green at each checkpoint: US2 (auth/sessions), US6 (verify/reset),
 * US7 (PATs). The metadata below documents the full surface the milestone covers.
 */
export const testPlan: ModuleTestPlan = {
  module: 'identity',
  providers: [
    'AuthService',
    'TokenSigner',
    'TokenVerifier',
    'RegisterProvider',
    'LoginProvider',
    'RefreshProvider',
    'LogoutProvider',
    'PasswordResetProvider',
    'ApiTokensProvider',
  ],
  controllers: [
    {
      controller: 'AuthController',
      routes: [
        'POST /auth/register',
        'POST /auth/login',
        'POST /auth/refresh',
        'POST /auth/logout',
        'GET /auth/whoami',
      ],
    },
    {
      controller: 'AuthRecoveryController',
      routes: [
        'POST /auth/verify-email',
        'POST /auth/request-password-reset',
        'POST /auth/confirm-password-reset',
      ],
    },
    {
      controller: 'ApiTokensController',
      routes: ['GET /api-tokens', 'POST /api-tokens', 'DELETE /api-tokens/{id}'],
    },
  ],
  policies: ['password.policy', 'token.policy', 'scope.policy'],
  mcpTools: ['whoami', 'list_api_tokens', 'create_api_token', 'revoke_api_token'],
  tenantScopedTables: ['users', 'sessions', 'api_tokens', 'one_time_tokens'],
  requiredTests: [
    // US2 — sign-in & sessions
    { kind: 'unit', target: 'password.policy', file: 'domain/password.policy.spec.ts' },
    { kind: 'unit', target: 'token.policy', file: 'domain/token.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'LoginProvider',
      file: 'providers/login.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'AuthController',
      file: 'controllers/auth.controller.contract.spec.ts',
    },
    { kind: 'tenancy', target: 'sessions', file: 'repositories/sessions.tenancy.spec.ts' },
    // Appended per user story (US6, US7).
  ],
};

export default testPlan;
