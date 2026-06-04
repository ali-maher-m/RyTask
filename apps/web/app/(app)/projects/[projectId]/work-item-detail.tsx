'use client';

import type { Status, WorkItem } from '@rytask/contracts';
import { useEffect, useRef } from 'react';
import { CommentThread } from '../../../components/comment-thread';

/**
 * Lightweight work-item detail drawer (US2 surface reused by Board + List). It shows the
 * item heading (the flagship e2e asserts `getByRole('heading', { name: title })`), its
 * status, and a minimal activity feed placeholder (`data-testid="activity-feed"`). A
 * Close button (matched by the e2e's `/close|back/i`) dismisses it. It is a modal dialog
 * for accessibility (axe): labelled, focus-moved on open, Escape closes.
 */
export function WorkItemDetail({
  item,
  statuses,
  onClose,
}: {
  item: WorkItem;
  statuses: Status[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const status = statuses.find((s) => s.id === item.statusId);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const headingId = `wi-detail-${item.id}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 50,
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          position: 'static',
          margin: 0,
          width: 'min(440px, 100%)',
          height: '100%',
          background: '#fff',
          border: 0,
          padding: '1.25rem',
          overflowY: 'auto',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <p style={{ margin: 0, color: '#555' }}>
            <code>{item.key}</code>
          </p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close detail">
            Close
          </button>
        </div>
        <h2 id={headingId} style={{ marginTop: '0.5rem' }}>
          {item.title}
        </h2>
        <dl>
          <dt>Status</dt>
          <dd>{status?.name ?? item.statusId}</dd>
          <dt>Priority</dt>
          <dd>{item.priority}</dd>
          {item.dueDate ? (
            <>
              <dt>Due</dt>
              <dd>{item.dueDate}</dd>
            </>
          ) : null}
        </dl>
        {item.description ? <p>{item.description}</p> : null}
        <section aria-label="Activity feed" data-testid="activity-feed">
          <h3>Activity</h3>
          <p>
            Current status: <strong>{status?.name ?? item.statusId}</strong>.
          </p>
        </section>
        <CommentThread workItemId={item.id} />
      </dialog>
    </div>
  );
}
