import type { statuses } from '@rytask/db';

type StatusCategory = (typeof statuses.$inferSelect)['category'];

/** A default status template (name + category + color + board position). */
export interface DefaultStatus {
  name: string;
  category: StatusCategory;
  color: string;
  position: number;
}

/**
 * The six categorized statuses every new project seeds with (FR-WF-001, data-model §2.4).
 * Mirrors the DB seed (`packages/db/src/seed.ts`) exactly — Backlog/To Do/In Progress/
 * Review/Done/Cancelled at positions 0..5 with categories BACKLOG/UNSTARTED/STARTED/
 * STARTED/COMPLETED/CANCELLED. The first UNSTARTED ("To Do") is the create-time default.
 */
export const DEFAULT_STATUSES: ReadonlyArray<DefaultStatus> = [
  { name: 'Backlog', category: 'BACKLOG', color: '#6B7280', position: 0 },
  { name: 'To Do', category: 'UNSTARTED', color: '#9CA3AF', position: 1 },
  { name: 'In Progress', category: 'STARTED', color: '#3B82F6', position: 2 },
  { name: 'Review', category: 'STARTED', color: '#A855F7', position: 3 },
  { name: 'Done', category: 'COMPLETED', color: '#22C55E', position: 4 },
  { name: 'Cancelled', category: 'CANCELLED', color: '#EF4444', position: 5 },
];
