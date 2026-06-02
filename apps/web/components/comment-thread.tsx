'use client';

import type { Comment, CommentEnvelope, CommentListResponse } from '@rytask/contracts';
import { type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { ApiError, authedRequest } from '../lib/api';

/**
 * Comment thread (US7, T115, FR-COLLAB-001/002, D9/D15). Threaded markdown comments with
 * @mention rendering for a single work item. It is a thin client over the US7 REST surface
 * (contracts/openapi.yaml, under /api/v1):
 *   GET  /work-items/{id}/comments — list (cursor-paginated `{ data, pageInfo }`)
 *   POST /work-items/{id}/comments — post a comment; optional `parentId` for a threaded reply
 *
 * Requests carry the M0 bearer token via `authedRequest` (the M1 dev-header seam is gone). A
 * posted `@mention` notifies the mentioned user and grants them context access to this item
 * (FR-COLLAB-002); the server resolves handles → `mentions` user ids on the returned comment.
 * Markdown rendering here is intentionally minimal (no third-party renderer): paragraphs,
 * inline code via backticks, and highlighted `@mention` spans. Every control has an accessible
 * name for axe.
 */

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * `@handle` spans: the `@` must follow a non-word boundary (so `founder@rytask.local` does
 * NOT match), mirroring the server's `extractMentions` grammar (work-items/domain/markdown.ts).
 * Captures the leading boundary char so it can be re-emitted verbatim.
 */
const MENTION_RE = /(^|[^\w@])@([a-zA-Z0-9][a-zA-Z0-9._-]*)/g;
/** Inline `` `code` `` spans (kept literal, no nested markdown). */
const INLINE_CODE_RE = /`([^`]+)`/g;

/** Render a single line: inline code first, then highlight `@mention` spans within text runs. */
function renderInline(line: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let codeKey = 0;
  for (const match of line.matchAll(INLINE_CODE_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      out.push(...renderMentions(line.slice(lastIndex, start), `${keyPrefix}-t${start}`));
    }
    out.push(
      <code key={`${keyPrefix}-c${codeKey++}`} data-testid="comment-code">
        {match[1]}
      </code>,
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < line.length) {
    out.push(...renderMentions(line.slice(lastIndex), `${keyPrefix}-t${lastIndex}`));
  }
  return out;
}

/** Wrap each `@mention` of a text run in a highlighted span; plain text stays as strings. */
function renderMentions(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    const boundary = match[1] ?? '';
    const handle = match[2] ?? '';
    const mentionStart = start + boundary.length;
    if (mentionStart > lastIndex) {
      out.push(text.slice(lastIndex, mentionStart));
    }
    out.push(
      <mark
        key={`${keyPrefix}-m${key++}`}
        data-testid="comment-mention"
        aria-label={`mention of ${handle}`}
        style={{ background: '#eef2ff', color: '#3730a3', borderRadius: 3, padding: '0 2px' }}
      >
        @{handle}
      </mark>,
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return out;
}

/**
 * Minimal markdown body renderer: split on blank lines into paragraphs, keep single newlines as
 * `<br>`, and highlight inline code + `@mention` spans. Deliberately dependency-free (D15 says
 * full markdown is the web client's concern; M1 needs safe, legible threads, not a CommonMark
 * engine). Returns React nodes (never `dangerouslySetInnerHTML`, so untrusted markdown can never
 * inject HTML).
 */
function renderMarkdownBody(body: string): ReactNode {
  const paragraphs = body.split(/\n{2,}/);
  return paragraphs.map((para, pIdx) => {
    const lines = para.split('\n');
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are positionally stable per render
      <p key={`p${pIdx}`} style={{ margin: '0 0 0.5rem' }}>
        {lines.map((line, lIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positionally stable per render
          <span key={`l${lIdx}`}>
            {renderInline(line, `p${pIdx}l${lIdx}`)}
            {lIdx < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  });
}

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
  return roots.map((comment) => ({
    comment,
    replies: repliesByParent.get(comment.id) ?? [],
  }));
}

export interface CommentThreadProps {
  /** The work item whose comments to show (path id for the comments routes). */
  workItemId: string;
}

export function CommentThread({ workItemId }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);

  const composerId = useId();
  const replyId = useId();
  const headingId = useId();

  const load = useCallback(async () => {
    try {
      const json = await authedRequest<CommentListResponse>(`/work-items/${workItemId}/comments`);
      setComments(json.data ?? []);
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

  const post = useCallback(
    async (text: string, parentId?: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || busy) return false;
      setBusy(true);
      setError(null);
      try {
        const json = await authedRequest<CommentEnvelope>(`/work-items/${workItemId}/comments`, {
          method: 'POST',
          body: JSON.stringify(parentId ? { body: trimmed, parentId } : { body: trimmed }),
        });
        setComments((prev) => [...(prev ?? []), json.data]);
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
      <h3 id={headingId}>Comments</h3>

      {error ? <p role="alert">{error}</p> : null}

      {comments === null ? (
        <p>Loading comments…</p>
      ) : threads.length === 0 ? (
        <p data-testid="comment-thread-empty">No comments yet. Start the discussion.</p>
      ) : (
        <ol aria-label="Comment thread" style={{ listStyle: 'none', padding: 0 }}>
          {threads.map((node) => (
            <li key={node.comment.id} data-testid="comment" style={{ marginBottom: '1rem' }}>
              <CommentBody comment={node.comment} />
              <p>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo((cur) => (cur === node.comment.id ? null : node.comment.id));
                    setReplyBody('');
                  }}
                  disabled={busy}
                  aria-expanded={replyTo === node.comment.id}
                  aria-label={`Reply to comment by ${node.comment.authorId}`}
                >
                  Reply
                </button>
              </p>

              {node.replies.length > 0 ? (
                <ol
                  aria-label="Replies"
                  style={{
                    listStyle: 'none',
                    paddingLeft: '1.25rem',
                    borderLeft: '2px solid #e3e5e8',
                  }}
                >
                  {node.replies.map((reply) => (
                    <li
                      key={reply.id}
                      data-testid="comment-reply"
                      style={{ marginBottom: '0.75rem' }}
                    >
                      <CommentBody comment={reply} />
                    </li>
                  ))}
                </ol>
              ) : null}

              {replyTo === node.comment.id ? (
                <form
                  onSubmit={(e) => void submitReply(e, node.comment.id)}
                  aria-label={`Reply to comment by ${node.comment.authorId}`}
                  style={{ paddingLeft: '1.25rem' }}
                >
                  <label htmlFor={`${replyId}-${node.comment.id}`}>Your reply (markdown)</label>
                  <textarea
                    id={`${replyId}-${node.comment.id}`}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                    disabled={busy}
                    placeholder="Reply… **markdown** and @mentions supported"
                  />
                  <button type="submit" disabled={busy || !replyBody.trim()}>
                    Post reply
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {/* ── Top-level composer ─────────────────────────────────────────────────── */}
      <form onSubmit={submitTop} aria-label="Add a comment">
        <label htmlFor={composerId}>Add a comment (markdown)</label>
        <textarea
          id={composerId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          disabled={busy}
          placeholder="Write a comment… **markdown** and @mentions supported"
        />
        <button type="submit" disabled={busy || !body.trim()}>
          {busy ? 'Posting…' : 'Comment'}
        </button>
      </form>
    </section>
  );
}

/** One rendered comment: author + timestamp header, then the markdown body with mentions. */
function CommentBody({ comment }: { comment: Comment }) {
  return (
    <article aria-label={`Comment by ${comment.authorId}`}>
      <header style={{ fontSize: '0.85rem', color: '#666' }}>
        <strong>{comment.authorId}</strong>{' '}
        <time dateTime={comment.createdAt}>{formatTimestamp(comment.createdAt)}</time>
        {comment.editedAt ? <span> (edited)</span> : null}
      </header>
      <div data-testid="comment-body">{renderMarkdownBody(comment.body)}</div>
    </article>
  );
}
