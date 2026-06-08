import type { SlackUserMappingDto } from '@rytask/contracts';
import type { SlackUserRow } from '../repositories/slack-users.repository';

/**
 * Pure mapper `slack_users` row → public `SlackUserMappingDto` (M3, US5, slack-rest.md §C). A leaf
 * function (no Nest, no I/O) shared by the list + map providers. The DTO carries only the Slack
 * identity, the linked RyTask user (or `null` when unmapped), and whether the link was manual —
 * never a bot token or any secret (Principle VI).
 */
export function toSlackUserMappingDto(row: SlackUserRow): SlackUserMappingDto {
  return {
    slackUserId: row.slackUserId,
    slackUserName: row.slackUserName,
    slackUserEmail: row.slackUserEmail,
    mappedUserId: row.userId,
    mappedManually: row.mappedManually,
  };
}
