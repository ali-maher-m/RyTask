import { JsonLd } from '@/components/json-ld';
import { jsonLdGraph, softwareApplicationSchema } from '@/lib/structured-data';
import Image from 'next/image';
import Link from 'next/link';

const SECTIONS = [
  {
    href: '/docs/tutorials',
    title: 'Tutorials',
    body: 'Start here. Self-host RyTask in about 15 minutes, then learn the everyday flow.',
  },
  {
    href: '/docs/guides',
    title: 'How-to guides',
    body: 'Practical steps for running, administering, and using every part of RyTask.',
  },
  {
    href: '/docs/reference',
    title: 'Reference',
    body: 'The REST API, all 49 MCP tools, environment variables, permissions, and more.',
  },
  {
    href: '/docs/explanation',
    title: 'Explanation',
    body: 'Why RyTask exists and how it is built: architecture, tenancy, and the time model.',
  },
];

export default function HomePage() {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        gap: 'var(--space-8)',
      }}
    >
      <JsonLd data={jsonLdGraph(softwareApplicationSchema())} />
      <div style={{ textAlign: 'center', maxWidth: 'var(--container-prose)' }}>
        {/*
         * The wordmark text must inherit the page foreground (the standalone
         * wordmark.svg uses currentColor, which resolves to black inside an
         * <img> and disappears in dark mode), so render mark + text inline —
         * same pattern as the nav title.
         */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-5)',
          }}
        >
          <Image src="/logo-mark.svg" alt="" width={40} height={40} priority />
          <span
            style={{
              fontFamily: 'var(--font-brand)',
              fontWeight: 'var(--w-display)' as never,
              fontSize: 'var(--fs-display)',
              letterSpacing: 'var(--track-display)',
            }}
          >
            RyTask
          </span>
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-brand)',
            fontWeight: 'var(--w-display)' as never,
            fontSize: 'var(--fs-display)',
            lineHeight: 'var(--lh-display)',
            letterSpacing: 'var(--track-display)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Know where the time went.
        </h1>
        <p style={{ color: 'var(--fg-muted)', lineHeight: 'var(--lh-body)' }}>
          RyTask is an open-source, self-hostable project tracker with native time tracking,
          first-class Slack capture, and an MCP server that gives AI agents the same control a
          person has in the app. These docs cover everything: running it, using it, and how it works
          inside.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-4)',
          width: '100%',
          maxWidth: 'var(--container-page)',
        }}
      >
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            style={{
              display: 'block',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              textDecoration: 'none',
              color: 'var(--fg)',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <h2
              style={{
                fontSize: 'var(--fs-h3)',
                fontWeight: 'var(--w-semibold)' as never,
                marginBottom: 'var(--space-2)',
              }}
            >
              {section.title}
            </h2>
            <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)', margin: 0 }}>
              {section.body}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
