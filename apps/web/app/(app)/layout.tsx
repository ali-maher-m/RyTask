import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { Providers } from './providers';

/**
 * Authenticated route-group layout (D6/D7). Mounts the client providers (Query + Session + Org +
 * Capability + Theme) and the persistent shell once, around every authed surface. Auth, setup, and
 * invite surfaces live outside this group and render bare.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
