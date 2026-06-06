'use client';

import { ApiError, createComment, listComments, listMemberships } from '@/lib/api';
import { useOrg } from '@/lib/org/org-context';
import type { Comment, UserSummary } from '@rytask/contracts';
import { Avatar, Button } from '@rytask/ui';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Markdown } from './markdown';

/**
 * Comment thread (US10, T085, FR-WEB-080/081, D17). Threaded markdown comments on one work item, with
 * **@mention autocomplete** resolving teammates via the members API. Bodies render through the shared
 * `Markdown` component (GFM + sanitized — no `dangerouslySetInnerHTML`). Posting a comment that
 * mentions a teammate notifies them server-side (the inbox gains one entry — FR-WEB-081); the server
 * resolves the `@handle`s on the returned comment. Replies are one level deep, assembled from the flat
 * server list by `parentId`. Token-only styling; every control is programmatically labelled (axe).
 */

/** A comment plus its direct replies, assembled from the flat server list by `parentId`. */
interface ThreadNode {
  comment: Comment;
  replies: Comment[];
}

/** Group a flat comment list into top-level threads, each with its direct replies (one level). */
function buildThreads(comments: Comment[]): ThreadNode[] {
  const repliesByParent = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    } else {
      roots.push(c);
    }
  }
  return roots.map((comment) => ({ comment, replies: repliesByParent.get(comment.id) ?? [] }));
}

/** A teammate's @mention handle is the local part of their email (matches the server grammar). */
function handleOf(user: UserSummary): string {
  return user.email.split('@')[0] ?? user.email;
}

/** The active `@query` immediately before the caret, or null when none is being typed. */
function activeMentionQuery(value: string, caret: number): string | null {
  const before = value.slice(0, caret);
  const match = before.match(/(?:^|[^\w@])@([a-zA-Z0-9._-]*)$/);
  return match ? (match[1] ?? '') : null;
}

const CARD: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  padding: 'var(--space-3)',
};

export interface CommentThreadProps {
  /** The work item whose comments to show (path id for the comments routes). */
  workItemId: string;
}

export function CommentThread({ workItemId }: CommentThreadProps) {
  const { formatDate } = useOrg();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);

  const headingId = useId();

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const authorName = useCallback((id: string) => usersById.get(id)?.name ?? id, [usersById]);

  const load = useCallback(async () => {
    try {
      setComments(await listComments(workItemId));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `Failed to load comments (${e.status})`
          : 'Network error while loading comments',
      );
    }
  }, [workItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Teammates power both @mention autocomplete and author-name resolution. Listing members can be
  // forbidden for a guest — degrade gracefully (handles still type fine; names fall back to ids).
  useEffect(() => {
    let active = true;
    listMemberships()
      .then((m) => {
        if (active) setUsers(m.map((x) => x.user));
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      active = false;
    };
  }, []);

  const post = useCallback(
    async (text: string, parentId?: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || busy) return false;
      setBusy(true);
      setError(null);
      try {
        const created = await createComment(
          workItemId,
          parentId ? { body: trimmed, parentId } : { body: trimmed },
        );
        setComments((prev) => [...(prev ?? []), created]);
        return true;
      } catch (e) {
        setError(
          e instanceof ApiError
            ? `Failed to post comment (${e.status})`
            : 'Network error while posting comment',
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [workItemId, busy],
  );

  async function submitTop(e: React.FormEvent) {
    e.preventDefault();
    if (await post(body)) setBody('');
  }

  async function submitReply(e: React.FormEvent, parentId: string) {
    e.preventDefault();
    if (await post(replyBody, parentId)) {
      setReplyBody('');
      setReplyTo(null);
    }
  }

  const threads = comments ? buildThreads(comments) : [];

  return (
    <section aria-labelledby={headingId} data-testid="comment-thread">
      <h3 id={headingId} style={{ fontSize: 'var(--fs-h3)' }}>
        Comments
      </h3>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}

      {comments === null ? (
        <p style={{ color: 'var(--fg-muted)' }}>Loading comments…</p>
      ) : threads.length === 0 ? (
        <p data-testid="comment-thread-empty" style={{ color: 'var(--fg-muted)' }}>
          No comments yet. Start the discussion.
        </p>
      ) : (
        <ol
          aria-label="Comment thread"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 'var(--space-3)',
          }}
        >
          {threads.map((node) => (
            <li key={node.comment.id} data-testid="comment">
              <CommentBody comment={node.comment} authorName={authorName} formatDate={formatDate} />
              <p style={{ margin: 'var(--space-1) 0' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setReplyTo((cur) => (cur === node.comment.id ? null : node.comment.id));
                    setReplyBody('');
                  }}
                  aria-expanded={replyTo === node.comment.id}
                  aria-label={`Reply to comment by ${authorName(node.comment.authorId)}`}
                >
                  Reply
                </Button>
              </p>

              {node.replies.length > 0 ? (
                <ol
                  aria-label="Replies"
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    paddingLeft: 'var(--space-4)',
                    borderLeft: '2px solid var(--border-subtle)',
                    display: 'grid',
                    gap: 'var(--space-2)',
                  }}
                >
                  {node.replies.map((reply) => (
                    <li key={reply.id} data-testid="comment-reply">
                      <CommentBody
                        comment={reply}
                        authorName={authorName}
                        formatDate={formatDate}
                      />
                    </li>
                  ))}
                </ol>
              ) : null}

              {replyTo === node.comment.id ? (
                <form
                  onSubmit={(e) => void submitReply(e, node.comment.id)}
                  aria-label={`Reply to comment by ${authorName(node.comment.authorId)}`}
                  style={{ paddingLeft: 'var(--space-4)', marginTop: 'var(--space-2)' }}
                >
                  <MentionTextarea
                    label="Your reply (markdown)"
                    value={replyBody}
                    onChange={setReplyBody}
                    users={users}
                    disabled={busy}
                    rows={3}
                    placeholder="Reply… **markdown** and @mentions supported"
                  />
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={busy || !replyBody.trim()}
                    >
                      Post reply
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={submitTop} aria-label="Add a comment" style={{ marginTop: 'var(--space-4)' }}>
        <MentionTextarea
          label="Add a comment (markdown)"
          value={body}
          onChange={setBody}
          users={users}
          disabled={busy}
          rows={4}
          placeholder="Write a comment… **markdown** and @mentions supported"
        />
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Button type="submit" variant="primary" loading={busy} disabled={!body.trim()}>
            Comment
          </Button>
        </div>
      </form>
    </section>
  );
}

/** One rendered comment: author + timestamp header, then the markdown body. */
function CommentBody({
  comment,
  authorName,
  formatDate,
}: {
  comment: Comment;
  authorName: (id: string) => string;
  formatDate: (iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) => string;
}) {
  const name = authorName(comment.authorId);
  return (
    <article aria-label={`Comment by ${name}`} style={CARD}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--fg-muted)',
        }}
      >
        <Avatar name={name} />
        <strong style={{ color: 'var(--fg)' }}>{name}</strong>
        <time dateTime={comment.createdAt} style={{ fontFamily: 'var(--font-mono)' }}>
          {formatDate(comment.createdAt, { hour: '2-digit', minute: '2-digit' })}
        </time>
        {comment.editedAt ? <span>(edited)</span> : null}
      </header>
      <div data-testid="comment-body">
        <Markdown source={comment.body} />
      </div>
    </article>
  );
}

interface MentionTextareaProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  users: UserSummary[];
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
}

/**
 * A markdown textarea with @mention autocomplete. As the user types `@partial`, it lists matching
 * teammates (by handle / name / email); choosing one inserts `@handle ` at the caret. Keyboard:
 * ↑/↓ move, Enter selects (without inserting a newline), Esc closes the menu.
 */
function MentionTextarea({
  label,
  value,
  onChange,
  users,
  disabled,
  rows = 4,
  placeholder,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();

  const candidates = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return users
      .filter((u) => {
        const hay = `${handleOf(u)} ${u.name} ${u.email}`.toLowerCase();
        return q.length === 0 ? true : hay.includes(q);
      })
      .slice(0, 6);
  }, [query, users]);

  const open = candidates.length > 0;
  const fieldId = `${listId}-input`;

  function syncQuery(el: HTMLTextAreaElement) {
    setQuery(activeMentionQuery(el.value, el.selectionStart ?? el.value.length));
    setActiveIndex(0);
  }

  function choose(user: UserSummary) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    // Replace the active `@partial` (immediately before the caret) with `@handle `.
    const replaced = before.replace(/@([a-zA-Z0-9._-]*)$/, `@${handleOf(user)} `);
    const next = replaced + after;
    onChange(next);
    setQuery(null);
    // Restore focus + place the caret right after the inserted handle.
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % candidates.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
    } else if (e.key === 'Enter') {
      const pick = candidates[activeIndex];
      if (pick) {
        e.preventDefault();
        choose(pick);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery(null);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <label
        htmlFor={fieldId}
        style={{
          display: 'block',
          fontSize: 'var(--fs-sm)',
          color: 'var(--fg-muted)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {label}
      </label>
      <textarea
        id={fieldId}
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        style={{
          font: 'inherit',
          width: '100%',
          color: 'var(--fg)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2)',
          resize: 'vertical',
        }}
        onChange={(e) => {
          onChange(e.target.value);
          syncQuery(e.currentTarget);
        }}
        onClick={(e) => syncQuery(e.currentTarget)}
        onKeyUp={(e) => {
          // Arrow/navigation keys move the caret without changing the value.
          if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
            syncQuery(e.currentTarget);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setQuery(null)}
      />
      {open ? (
        // A lightweight suggestion menu of focusable buttons (not an ARIA listbox): the textarea
        // keeps focus and the caret, ↑/↓/Enter drive selection, and each option is itself clickable.
        <ul
          aria-label="Mention a teammate"
          data-testid="mention-menu"
          style={{
            position: 'absolute',
            zIndex: 1,
            left: 0,
            right: 0,
            margin: 'var(--space-1) 0 0',
            padding: 'var(--space-1)',
            listStyle: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {candidates.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                // Use mousedown so the choice lands before the textarea blur closes the menu.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(u);
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-1) var(--space-2)',
                  border: 0,
                  borderRadius: 'var(--radius-xs)',
                  background: i === activeIndex ? 'var(--surface-sunken)' : 'transparent',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Avatar name={u.name} />
                <span>
                  <span style={{ fontWeight: 'var(--w-medium)' }}>{u.name}</span>{' '}
                  <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                    @{handleOf(u)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
