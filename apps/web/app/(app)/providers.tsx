'use client';

import { CapabilityProvider } from '@/lib/auth/capability-context';
import { SessionProvider } from '@/lib/auth/session-context';
import { OrgProvider } from '@/lib/org/org-context';
import { QueryProvider } from '@/lib/query/query-provider';
import { ThemeProvider } from '@/lib/theme/theme-context';
import type { ReactNode } from 'react';

/**
 * Client providers mounted once by the authenticated shell (D7). Order matters: the Query client
 * is outermost (OrgProvider reads it), then Theme, then Session (the source of the principal),
 * with Capability + Org derived from the session inside it.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <SessionProvider>
          <CapabilityProvider>
            <OrgProvider>{children}</OrgProvider>
          </CapabilityProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
