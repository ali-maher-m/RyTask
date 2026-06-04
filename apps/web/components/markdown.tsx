'use client';

import { type ComponentPropsWithoutRef, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

/**
 * Markdown renderer (US3, T045, FR-WEB-022, D17). Renders item descriptions and comments with
 * `react-markdown` + `remark-gfm` (GFM: tables, autolinks, task lists) + `rehype-sanitize` (the HTML
 * output is sanitized, so untrusted markdown can never inject script/markup — no
 * `dangerouslySetInnerHTML`). Code, links, and images render; links open safely in a new tab.
 *
 * GFM **task lists** are interactive when `onToggleTask` is supplied: toggling a checkbox rewrites the
 * corresponding `- [ ]`/`- [x]` marker in the *source* and calls back so the caller can persist the
 * new description (the checkbox state lives in the markdown, not in component state). Everything is
 * token-only (semantic `var(--*)`), so it renders identically in light & dark.
 */

export interface MarkdownProps {
  /** The raw markdown source to render. */
  source: string;
  /**
   * When provided, GFM task-list checkboxes become interactive; on toggle this is called with the
   * full rewritten source (the nth `[ ]`/`[x]` flipped). Omit for a read-only render.
   */
  onToggleTask?: (nextSource: string) => void;
}

/** Matches a GFM task marker at the start of a list item: `- [ ]`, `* [x]`, `1. [X]`, … */
const TASK_MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm;

/** Flip the nth (0-based) task marker in `source` to `checked`, leaving the rest untouched. */
export function toggleNthTask(source: string, n: number, checked: boolean): string {
  let i = 0;
  return source.replace(TASK_MARKER, (match, prefix: string) => {
    if (i++ !== n) return match;
    return `${prefix}[${checked ? 'x' : ' '}]`;
  });
}

const PROSE: React.CSSProperties = {
  fontSize: 'var(--fs-body)',
  lineHeight: 'var(--lh-body)',
  color: 'var(--fg)',
  wordBreak: 'break-word',
};

export function Markdown({ source, onToggleTask }: MarkdownProps) {
  // Reset before each render so checkboxes are numbered in document order (single synchronous pass).
  const taskIndex = useRef(0);
  taskIndex.current = 0;

  const components: Components = {
    a: ({ node: _node, ...props }: ComponentPropsWithoutRef<'a'> & { node?: unknown }) => (
      <a
        {...props}
        target="_blank"
        rel="noopener noreferrer nofollow"
        style={{ color: 'var(--accent)' }}
      >
        {props.children}
      </a>
    ),
    code: ({ node: _node, ...props }: ComponentPropsWithoutRef<'code'> & { node?: unknown }) => (
      <code
        {...props}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-sm)',
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-xs)',
          padding: '0.1em 0.3em',
        }}
      />
    ),
    pre: ({ node: _node, ...props }: ComponentPropsWithoutRef<'pre'> & { node?: unknown }) => (
      <pre
        {...props}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-sm)',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-3)',
          overflowX: 'auto',
        }}
      />
    ),
    blockquote: ({
      node: _node,
      ...props
    }: ComponentPropsWithoutRef<'blockquote'> & { node?: unknown }) => (
      <blockquote
        {...props}
        style={{
          borderLeft: '3px solid var(--border-strong)',
          margin: 'var(--space-2) 0',
          paddingLeft: 'var(--space-3)',
          color: 'var(--fg-muted)',
        }}
      />
    ),
    img: ({ node: _node, ...props }: ComponentPropsWithoutRef<'img'> & { node?: unknown }) => (
      // biome-ignore lint/a11y/useAltText: alt is carried through from the markdown when present
      <img {...props} style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />
    ),
    input: ({ node: _node, ...props }: ComponentPropsWithoutRef<'input'> & { node?: unknown }) => {
      if (props.type !== 'checkbox') return <input {...props} />;
      const index = taskIndex.current;
      taskIndex.current += 1;
      const checked = Boolean(props.checked);
      if (!onToggleTask) {
        // Read-only render: keep the box visible but inert.
        return (
          <input type="checkbox" checked={checked} readOnly aria-label={`Task ${index + 1}`} />
        );
      }
      return (
        <input
          type="checkbox"
          checked={checked}
          aria-label={`Toggle task ${index + 1}`}
          onChange={() => onToggleTask(toggleNthTask(source, index, !checked))}
          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
      );
    },
  };

  return (
    <div data-testid="markdown" style={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
