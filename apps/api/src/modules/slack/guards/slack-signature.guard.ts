import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  type IntegrationsConfigType,
  integrationsConfig,
} from '../../../common/config/integrations.config';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { verifySlackSignature } from '../domain/slack-signature.policy';

/**
 * Guards the Slack webhook routes (`/commands`, `/interactivity`) — M3, US2, research D4. It is the
 * ONLY place that reads the raw request body (captured via `rawBody: true` in `main.ts`) and the
 * `X-Slack-*` headers, delegating the actual check to the pure `verifySlackSignature` policy.
 * A missing/invalid signature, stale timestamp, or unconfigured Slack yields 401 BEFORE any handler
 * work — so a forged or replayed request creates no item and enqueues nothing (FR-SLK-014).
 *
 * The routes it guards are `@Public()` (the global Auth/Tenant/RBAC guards skip them — Slack has no
 * RyTask bearer token); THIS guard is their authentication.
 */
@Injectable()
export class SlackSignatureGuard implements CanActivate {
  constructor(
    @Inject(integrationsConfig.KEY) private readonly integrations: IntegrationsConfigType,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const signingSecret = this.integrations.slack.signingSecret;
    if (!signingSecret) {
      // Webhooks can only legitimately arrive when Slack is configured; reject otherwise.
      throw new UnauthorizedException('Slack is not configured');
    }
    const ok = verifySlackSignature({
      rawBody: req.rawBody?.toString('utf8') ?? '',
      timestamp: header(req, 'x-slack-request-timestamp'),
      signature: header(req, 'x-slack-signature'),
      signingSecret,
      nowSeconds: Math.floor(this.clock.now().getTime() / 1000),
    });
    if (!ok) {
      throw new UnauthorizedException('invalid Slack signature');
    }
    return true;
  }
}

/** Read a single header value (Express may surface a header as a string or string[]). */
function header(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}
