import { faqPageSchema, jsonLdGraph } from '@/lib/structured-data';
import { Children, type CSSProperties, isValidElement, type ReactNode } from 'react';
import { JsonLd } from './json-ld';

/**
 * An accessible FAQ block for docs pages. It renders each question as a native
 * `<details>` disclosure AND emits FAQPage JSON-LD so search/answer engines can
 * surface the answers directly. Authors give each item a plain-text `answer`
 * (the schema needs text) and may pass richer `children` for the visible body.
 *
 * ```mdx
 * <FAQ>
 *   <FAQItem question="How do I back up RyTask?" answer="Run `make backup` ...">
 *     Run <code>make backup</code> — it dumps Postgres and copies object storage.
 *   </FAQItem>
 * </FAQ>
 * ```
 */

const summary: CSSProperties = {
  cursor: 'pointer',
  fontWeight: 'var(--w-semibold)' as CSSProperties['fontWeight'],
  color: 'var(--fg)',
  padding: 'var(--space-3) var(--space-4)',
  listStyle: 'none',
};

export function FAQItem({
  question,
  children,
}: {
  question: string;
  /** Plain-text answer used for the FAQPage JSON-LD (falls back to children for display). */
  answer?: string;
  children: ReactNode;
}) {
  return (
    <details style={{ borderTop: '1px solid var(--border)' }}>
      <summary style={summary}>{question}</summary>
      <div
        style={{
          padding: '0 var(--space-4) var(--space-4)',
          color: 'var(--fg-2)',
          lineHeight: 'var(--lh-body)',
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function FAQ({ children }: { children: ReactNode }) {
  const entries = Children.toArray(children)
    .filter((child): child is React.ReactElement<{ question?: string; answer?: string }> =>
      isValidElement(child),
    )
    .map((child) => child.props)
    .filter((props): props is { question: string; answer: string } =>
      Boolean(props.question && props.answer),
    )
    .map((props) => ({ question: props.question, answer: props.answer }));

  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        margin: 'var(--space-5) 0',
      }}
    >
      {entries.length > 0 ? <JsonLd data={jsonLdGraph(faqPageSchema(entries))} /> : null}
      {children}
    </section>
  );
}
