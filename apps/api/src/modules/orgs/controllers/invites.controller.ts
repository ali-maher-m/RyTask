import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  type AcceptInvite,
  type AcceptInviteResult,
  type CreateInvite,
  type Invitation,
  type InvitationCreated,
  type InvitePreview,
  acceptInviteSchema,
  createInviteSchema,
} from '@rytask/contracts';
import type { RequestWithPrincipal } from '../../../common/auth/principal';
import { Public, RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { AcceptInviteProvider } from '../providers/accept-invite.provider';
import { InviteProvider } from '../providers/invite.provider';

/**
 * Invitations REST surface under /api/v1 (contracts/openapi.yaml, FR-AUTH-011). Create/revoke
 * require `members:invite`; list requires `members:read`; preview + accept are `@Public`
 * (token-bearing — the secret in the path is the credential). `@RequirePermission` declares
 * the gate; enforcement goes live in US4's RbacGuard.
 */
@Controller('invites')
export class InvitesController {
  constructor(
    private readonly invites: InviteProvider,
    private readonly acceptProvider: AcceptInviteProvider,
  ) {}

  @RequirePermission('members:read')
  @Get()
  list(): Promise<Invitation[]> {
    return this.invites.list();
  }

  @RequirePermission('members:invite')
  @Post()
  @HttpCode(201)
  create(
    @Req() req: RequestWithPrincipal,
    @Body(new ZodValidationPipe<CreateInvite>(createInviteSchema)) body: CreateInvite,
  ): Promise<InvitationCreated> {
    // Non-public route: AuthGuard guarantees `req.principal` is set.
    return this.invites.create(
      req.principal as NonNullable<RequestWithPrincipal['principal']>,
      body,
    );
  }

  @Public()
  @Get(':token')
  preview(@Param('token') token: string): Promise<InvitePreview> {
    return this.invites.preview(token);
  }

  @Public()
  @Post(':token/accept')
  @HttpCode(200)
  accept(
    @Req() req: RequestWithPrincipal,
    @Param('token') token: string,
    @Body(new ZodValidationPipe<AcceptInvite>(acceptInviteSchema)) body: AcceptInvite,
  ): Promise<AcceptInviteResult> {
    // Public, but a signed-in caller's principal is honored when a bearer token is present.
    return this.acceptProvider.accept(token, body, req.principal);
  }

  @RequirePermission('members:invite')
  @Delete(':id/_revoke')
  @HttpCode(204)
  revoke(@Param('id') id: string): Promise<void> {
    return this.invites.revoke(id);
  }
}
