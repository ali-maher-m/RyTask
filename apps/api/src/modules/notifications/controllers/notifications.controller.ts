import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  type ListNotificationsQuery,
  type NotificationEnvelope,
  type NotificationListResponse,
  type UnreadCountResponse,
  type UpdateNotification,
  listNotificationsQuerySchema,
  updateNotificationSchema,
} from '@rytask/contracts';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { NotificationsService } from '../services/notifications.service';

/**
 * Notifications REST surface under /api/v1 (contracts/openapi.yaml). The inbox is always
 * scoped to the authenticated principal (RBAC `authenticated`) in the provider — a user
 * may only see/mutate their own notifications. The tenant/principal is resolved
 * server-side, never from the body.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe<ListNotificationsQuery>(listNotificationsQuerySchema))
    query: ListNotificationsQuery,
  ): Promise<NotificationListResponse> {
    return this.service.list(query);
  }

  @Get('unread-count')
  unreadCount(): Promise<UnreadCountResponse> {
    return this.service.unreadCount();
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe<UpdateNotification>(updateNotificationSchema))
    body: UpdateNotification,
  ): Promise<NotificationEnvelope> {
    if (body.read === undefined && !('snoozedUntil' in body) && body.archived === undefined) {
      throw new BadRequestException('at least one of read / snoozedUntil / archived is required');
    }
    return this.service.update(id, body);
  }
}
