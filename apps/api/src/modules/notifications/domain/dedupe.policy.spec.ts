import { describe, expect, it } from 'vitest';
import { type NotificationEvent, dedupeKey, planNotifications } from './dedupe.policy';

/**
 * Dedupe + mention-fanout policy (T101, FR-NOTIF-001, SC-010). Pure: self-mention
 * suppressed; one event matching several rules → a single stable `dedupe_key`.
 */
const ITEM = '0193b3a0-0000-7000-8000-000000000020';
const ALICE = '0193b3a0-0000-7000-8000-0000000000a1';
const BOB = '0193b3a0-0000-7000-8000-0000000000a2';

const event = (over: Partial<NotificationEvent>): NotificationEvent => ({
  type: 'COMMENTED',
  entityType: 'work_item',
  entityId: ITEM,
  actorId: ALICE,
  recipientIds: [BOB],
  ...over,
});

describe('dedupe.policy', () => {
  it('suppresses the actor (self-action / self-mention)', () => {
    const rows = planNotifications(event({ recipientIds: [ALICE, BOB] }));
    expect(rows.map((r) => r.recipientId)).toEqual([BOB]);
  });

  it('emits exactly one row per recipient (dedupes repeated recipients)', () => {
    const rows = planNotifications(event({ actorId: null, recipientIds: [BOB, BOB, ALICE] }));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.recipientId))).toEqual(new Set([BOB, ALICE]));
  });

  it('produces a stable dedupe_key for the same (recipient, entity, type, bucket)', () => {
    const k1 = dedupeKey(BOB, ITEM, 'COMMENTED', ITEM);
    const k2 = dedupeKey(BOB, ITEM, 'COMMENTED', ITEM);
    expect(k1).toBe(k2);
  });

  it('collapses an event matching several rules to a single key via the bucket', () => {
    // Same recipient/entity/type/bucket fired twice (e.g. assignment + watcher rule) →
    // identical key, so the unique index admits exactly one row.
    const a = planNotifications(event({ type: 'STATUS_CHANGED', actorId: null, bucket: 'v7' }));
    const b = planNotifications(event({ type: 'STATUS_CHANGED', actorId: null, bucket: 'v7' }));
    expect(a[0]?.dedupeKey).toBe(b[0]?.dedupeKey);
  });

  it('different recipients / types / buckets yield different keys', () => {
    const base = dedupeKey(BOB, ITEM, 'COMMENTED', ITEM);
    expect(dedupeKey(ALICE, ITEM, 'COMMENTED', ITEM)).not.toBe(base);
    expect(dedupeKey(BOB, ITEM, 'MENTIONED', ITEM)).not.toBe(base);
    expect(dedupeKey(BOB, ITEM, 'COMMENTED', 'other-bucket')).not.toBe(base);
  });

  it('defaults the bucket to the entityId when none is given', () => {
    const rows = planNotifications(event({ actorId: null }));
    expect(rows[0]?.dedupeKey).toBe(dedupeKey(BOB, ITEM, 'COMMENTED', ITEM));
  });

  it('returns no rows when the only candidate is the actor', () => {
    expect(planNotifications(event({ recipientIds: [ALICE] }))).toEqual([]);
  });
});
