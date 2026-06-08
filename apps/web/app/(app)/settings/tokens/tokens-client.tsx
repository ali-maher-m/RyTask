'use client';

import { TokensPanel } from '@/components/tokens-panel';
import Link from 'next/link';

/**
 * Personal Access Token manager (US9, T082, FR-WEB-074, NFR-WEB-005, SC-012). Page chrome around
 * the reusable {@link TokensPanel} (extracted so the M3 Agent-access page reuses it verbatim —
 * research D15). The panel mints a token with a limited scope (effective permission is always
 * scope ∩ your role), shows the secret **once**, lists tokens with last-used time, and revokes
 * any token immediately. Tokens authenticate non-UI callers (CLI, CI, MCP agents) on your behalf.
 */
const MAIN: React.CSSProperties = { padding: 'var(--space-4)', maxWidth: '44rem' };

export function TokensClient() {
  return (
    <main style={MAIN}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Access tokens</h1>
        <nav>
          <Link href="/" style={{ color: 'var(--accent)' }}>
            Home
          </Link>
        </nav>
      </header>
      <p style={{ color: 'var(--fg-muted)' }}>
        Tokens let tools and AI agents act on your behalf. A token can only ever do what your role
        allows.
      </p>

      <TokensPanel />
    </main>
  );
}
