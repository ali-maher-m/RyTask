'use client';

import { decideProtectedRoute } from '@/lib/auth/routing';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

/**
 * Client-side auth gate for the authenticated app surface (D18, FR-WEB-002). The M0 session is a
 * cookieless bearer token in `localStorage`, so the check must run in the browser — middleware
 * can't see it. It runs the routing state machine: signed-in users pass through; an org-less,
 * brand-new instance routes to `/setup`; otherwise an unauthenticated hit goes to
 * `/login?next=<dest>` so sign-in returns the user to where they were headed. Renders nothing
 * until the decision resolves (no flash of a protected page, no hard-401).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    const dest = `${window.location.pathname}${window.location.search}`;
    void decideProtectedRoute(dest).then((decision) => {
      if (!active) return;
      if (decision.kind === 'allow') {
        setAllowed(true);
      } else {
        router.replace(decision.to);
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (!allowed) return null;
  return <>{children}</>;
}
