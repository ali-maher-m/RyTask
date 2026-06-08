'use client';

import { TokensPanel } from '@/components/tokens-panel';
import { ApiError, getMcpConfig } from '@/lib/api';
import type { McpServerConfigDto } from '@rytask/contracts';
import { Button } from '@rytask/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/**
 * Agent (MCP) access (US6, FR-WEB-110/111, web-surfaces.md §3.C). Shows the MCP server endpoint(s)
 * with copy-to-clipboard (mono via `--font-mono`) and ≤5 plain-language connect steps (SC-005,
 * Albert/Marissa), then **reuses** the M0 `TokensPanel` to mint/scope/revoke PATs (secret shown
 * once — research D15, NFR-WEB-005). Visible to every user (everyone manages their own tokens).
 * Token-only styling; no secret ever appears in a URL or log.
 */
const MAIN: React.CSSProperties = { padding: 'var(--space-4)', maxWidth: '44rem' };
const CARD: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  padding: 'var(--space-4)',
  display: 'grid',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-3)',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-sm)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-1)',
};
const ENDPOINT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-sm)',
  color: 'var(--fg)',
  background: 'var(--surface-sunken)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  wordBreak: 'break-all',
};

/** ≤5 plain steps (SC-005). Kept short and jargon-free so a non-technical teammate can follow. */
const CONNECT_STEPS: string[] = [
  'Create an access token below and copy it — you’ll only see it once.',
  'Open your AI agent or MCP client’s settings.',
  'Add RyTask as an MCP server using the address above.',
  'Paste your token as the credential (Authorization: Bearer).',
  'Start chatting — your agent can do anything your role allows, nothing more.',
];

export function AgentAccessClient() {
  const [config, setConfig] = useState<McpServerConfigDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getMcpConfig()
      .then(setConfig)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'Could not load the MCP endpoint.'),
      );
  }, []);

  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); the value is still selectable.
    }
  }, []);

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
        <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Agent access</h1>
        <nav>
          <Link href="/settings/tokens" style={{ color: 'var(--accent)' }}>
            All access tokens
          </Link>
        </nav>
      </header>
      <p style={{ color: 'var(--fg-muted)' }}>
        Connect an AI agent so it can capture, triage, and track work for you — through RyTask’s MCP
        server. An agent can only ever do what your role allows.
      </p>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', marginTop: 'var(--space-2)' }}>
          {error}
        </p>
      ) : null}

      <section aria-label="MCP server" style={CARD} data-testid="mcp-endpoint-card">
        <h2 style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>Server address</h2>
        {config === null ? (
          <p style={{ color: 'var(--fg-muted)', margin: 0 }}>Loading…</p>
        ) : (
          <>
            <div>
              <span style={LABEL}>Remote (HTTP / SSE)</span>
              {config.httpUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ ...ENDPOINT, flex: 1 }} data-testid="mcp-http-url">
                    {config.httpUrl}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void copy('http', config.httpUrl ?? '')}
                  >
                    {copied === 'http' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              ) : (
                <p style={{ color: 'var(--fg-muted)', margin: 0, fontSize: 'var(--fs-sm)' }}>
                  The remote endpoint isn’t configured yet. Ask an admin to set{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>MCP_PUBLIC_URL</span>, or use the
                  local option below.
                </p>
              )}
            </div>
            <div>
              <span style={LABEL}>Local (stdio)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ ...ENDPOINT, flex: 1 }} data-testid="mcp-stdio-hint">
                  {config.stdioHint}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void copy('stdio', config.stdioHint)}
                >
                  {copied === 'stdio' ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <section aria-label="How to connect" style={{ marginTop: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--fs-h2)' }}>How to connect</h2>
        <ol style={{ paddingLeft: 'var(--space-4)', color: 'var(--fg-2)' }}>
          {CONNECT_STEPS.map((step) => (
            <li key={step} style={{ marginBottom: 'var(--space-2)' }}>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Access tokens" style={{ marginTop: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--fs-h2)' }}>Your tokens</h2>
        <p style={{ color: 'var(--fg-muted)', marginTop: 0 }}>
          Create a token for your agent. Copy it as soon as it appears — it’s shown only once.
        </p>
        <TokensPanel />
      </section>
    </main>
  );
}
