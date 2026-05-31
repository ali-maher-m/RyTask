/**
 * Markdown helpers for work-item descriptions / comments (FR-WI-006, D15). Zero
 * dependency by design (the quick-add grammar and mention parsing stay pure so they are
 * trivially testable and identical across surfaces). M1 only needs @mention extraction;
 * full markdown rendering is the web client's concern.
 */

/**
 * `@handle` spans: the `@` must follow a non-word boundary (so `founder@rytask.local`
 * does NOT match — there is a word char before `@`). A handle is letters/digits with
 * internal `.`/`-`/`_` separators (matching the quick-add assignee grammar).
 */
const MENTION_RE = /(^|[^\w@])@([a-zA-Z0-9][a-zA-Z0-9._-]*)/g;

/**
 * Extract the distinct `@mention` handles from markdown, in first-seen order. Emails are
 * ignored (no preceding boundary). The caller resolves handles to users and seeds
 * MENTIONED watchers / the notify seam.
 */
export function extractMentions(markdown: string): string[] {
  if (!markdown) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of markdown.matchAll(MENTION_RE)) {
    const handle = match[2];
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}
