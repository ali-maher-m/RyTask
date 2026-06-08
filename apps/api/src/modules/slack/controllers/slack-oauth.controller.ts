import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { Public, RequirePermission } from '../../../common/rbac/decorators';
import { SLACK_SERVICE, type SlackService } from '../slack.contract';

/**
 * Slack OAuth install + callback (US1, FR-SLK-001, FR-WEB-101, research D16, slack-rest.md §A).
 *
 *   GET /api/v1/integrations/slack/install   — admin-gated; returns the Slack consent URL.
 *   GET /integrations/slack/oauth/callback    — Slack redirect (no session); validates state,
 *                                               connects, then 302 → the settings page.
 *
 * Install returns the consent `{ url }` as JSON rather than a 302: RyTask auth is cookieless
 * (bearer token in the SPA), so a full-page redirect couldn't carry the principal — the SPA
 * fetches this with its token, then navigates the page to Slack. The callback is `@Public` and
 * served at the ROOT (excluded from the `/api/v1` prefix in `main.ts`) because Slack redirects a
 * browser here with no bearer token — the signed `state` is the only trusted org binding. No
 * Slack secret ever appears in a URL or response body (Principle VI).
 */
@Controller('integrations/slack')
export class SlackOAuthController {
  constructor(
    @Inject(SLACK_SERVICE) private readonly slack: SlackService,
    @Inject(authConfig.KEY) private readonly auth: AuthConfigType,
  ) {}

  @RequirePermission('org:settings:write')
  @Get('install')
  install(): Promise<{ url: string }> {
    return this.slack.beginInstall();
  }

  @Public()
  @Get('oauth/callback')
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') slackError?: string,
  ): Promise<void> {
    const base = this.auth.appBaseUrl;
    // Declined / interrupted consent → record nothing, return to "Not connected" with a reason.
    if (slackError || !code || !state) {
      const reason = encodeURIComponent(slackError ?? 'missing_code');
      res.redirect(302, `${base}/settings/integrations?error=${reason}`);
      return;
    }
    try {
      await this.slack.completeInstall({ code, state });
      res.redirect(302, `${base}/settings/integrations?connected=1`);
    } catch {
      res.redirect(302, `${base}/settings/integrations?error=connect_failed`);
    }
  }
}
