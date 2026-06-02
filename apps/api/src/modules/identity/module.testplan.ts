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
    {
      kind: 'integration',
      target: 'brute-force lockout',
      file: 'providers/brute-force.int.spec.ts',
    },
    // US6 — recovery (verify-email + password reset)
    {
      kind: 'integration',
      target: 'PasswordResetProvider',
      file: 'providers/password-reset.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'AuthRecoveryController',
      file: 'controllers/auth-recovery.controller.contract.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'one_time_tokens',
      file: 'repositories/one-time-tokens.tenancy.spec.ts',
    },
    // US7 — personal access tokens
    { kind: 'unit', target: 'scope.policy', file: 'domain/scope.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'ApiTokensProvider',
      file: 'providers/api-tokens.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'ApiTokensController',
      file: 'controllers/api-tokens.controller.contract.spec.ts',
    },
    { kind: 'tenancy', target: 'api_tokens', file: 'repositories/api-tokens.tenancy.spec.ts' },
  ],
};

export default testPlan;
