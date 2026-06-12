'use client';

import { type CSSProperties, useState } from 'react';

/**
 * A compact row of agent-friendly actions above each docs page: copy the page
 * as Markdown, open the raw Markdown, or hand it to ChatGPT/Claude. Backed by
 * the per-page `.mdx` route — part of making the docs first-class for AI agents.
 */

const action: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 'var(--w-medium)' as CSSProperties['fontWeight'],
  color: 'var(--fg-2)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  textDecoration: 'none',
  cursor: 'pointer',
  lineHeight: 1.4,
};

export function PageAiActions({
  markdownUrl,
  markdownAbsoluteUrl,
}: {
  markdownUrl: string;
  markdownAbsoluteUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      const res = await fetch(markdownUrl);
      await navigator.clipboard.writeText(await res.text());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard or fetch blocked — the "View as Markdown" link still works.
    }
  }

  const prompt = `Read ${markdownAbsoluteUrl} so you can answer my questions about RyTask.`;
  const chatGptUrl = `https://chatgpt.com/?hints=search&q=${encodeURIComponent(prompt)}`;
  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 'var(--space-2)',
        margin: 'var(--space-3) 0 var(--space-5)',
      }}
    >
      <button type="button" onClick={copy} style={action}>
        {copied ? 'Copied' : 'Copy as Markdown'}
      </button>
      <a href={markdownUrl} style={action}>
        View as Markdown
      </a>
      <a href={chatGptUrl} target="_blank" rel="noreferrer" style={action}>
        Open in ChatGPT
      </a>
      <a href={claudeUrl} target="_blank" rel="noreferrer" style={action}>
        Open in Claude
      </a>
    </div>
  );
}
