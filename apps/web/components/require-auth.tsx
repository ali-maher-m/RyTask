'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { isSignedIn } from '../lib/api';

/**
 * Client-side auth gate for the authenticated app surface (the M1 pages: inbox, my-work, board,
 * list). The M0 session is a cookieless bearer token held in `localStorage`, so the check must
 * run in the browser — middleware can't see it. When there is no access token we redirect to
 * `/login` (preserving the intended path in `?next=` so login can return here); otherwise we
 * render the protected children. Without this gate the M1 pages fire requests that hard-401 with
 * no path back to sign-in.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (isSignedIn()) {
      setAllowed(true);
      return;
    }
    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [router]);

  // Render nothing until the token check passes (avoids a flash of the protected page + a 401).
  if (!allowed) return null;
  return <>{children}</>;
}
