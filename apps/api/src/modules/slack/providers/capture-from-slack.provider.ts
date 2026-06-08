import { Inject, Injectable } from '@nestjs/common';
import type { CreateWorkItemResponse, Priority } from '@rytask/contracts';
import {
  WORK_ITEM_CAPTURE,
  type WorkItemCaptureService,
} from '../../work-items/work-items.contract';

/** Structured fields a Block Kit modal submit carries (US3); all optional but `projectId`. */
export interface SlackModalCapture {
  projectId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
}

/**
 * Bridges Slack capture to the work-items **capture contract** (M3, US2/US3, research D1/D5). It is
 * the SAME `create` the web/REST path uses — one brain everywhere: the slash path passes the raw
 * text as `quickAdd` so the existing M1 grammar parses `@assignee !priority #label ^date` verbatim
 * (`#` stays a label), and the modal path passes the chosen fields. Every item is stamped
 * `source = 'SLACK'`. `reporterId` is the mapped captor (or `null` when unmapped); the worker runs
 * this under the install-admin tenant context so RBAC never blocks capture (FR-SLK-012, research D8).
 *
 * The module depends only on `WORK_ITEM_CAPTURE` (never `WorkItemsService` directly) — Principle III.
 */
@Injectable()
export class CaptureFromSlackProvider {
  constructor(@Inject(WORK_ITEM_CAPTURE) private readonly capture: WorkItemCaptureService) {}

  /** Slash `/task …` capture: the raw text is parsed by the shared quick-add grammar (D5). */
  fromQuickAdd(
    projectId: string,
    text: string,
    reporterId: string | null,
  ): Promise<CreateWorkItemResponse> {
    return this.capture.create({ projectId, quickAdd: text, source: 'SLACK', reporterId });
  }

  /** Modal capture (US3): explicit fields chosen in the Block Kit form; title-only still creates. */
  fromModal(fields: SlackModalCapture, reporterId: string | null): Promise<CreateWorkItemResponse> {
    return this.capture.create({
      projectId: fields.projectId,
      title: fields.title,
      description: fields.description ?? undefined,
      assigneeId: fields.assigneeId ?? undefined,
      priority: fields.priority,
      dueDate: fields.dueDate ?? undefined,
      source: 'SLACK',
      reporterId,
    });
  }
}
