'use client';

import type { WhoAmI } from '@rytask/contracts';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { clearSession, isSignedIn } from '../api';
import { logout, whoami } from '../api/auth';

/**
 * Session state (D7, data-model §1.1). The client's notion of "who is signed in", hydrated from
 * the `localStorage` bearer (lib/api.ts) + a `whoami` fetch. It never holds a password or refresh
 * token in React state — tokens live only in `localStorage`, never in a URL or log (NFR-WEB-005).
 * Silent refresh is owned by the fetch layer; this context only observes the resulting
 * authenticated/anonymous transition and exposes a clean `signOut`.
 */
export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionContextValue {
  status: SessionStatus;
  principal: WhoAmI | null;
  /** Re-fetch whoami (e.g. after a role change mid-session reflects on next navigation). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [principal, setPrincipal] = useState<WhoAmI | null>(null);

  const load = useCallback(async () => {
    if (!isSignedIn()) {
      setPrincipal(null);
      setStatus('anonymous');
      return;
    }
    try {
      const me = await whoami();
      setPrincipal(me);
      setStatus('authenticated');
    } catch {
      // The fetch layer already tried a silent refresh; a failure here means no usable session.
      clearSession();
      setPrincipal(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setPrincipal(null);
      setStatus('anonymous');
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo(
    () => ({ status, principal, refresh: load, signOut }),
    [status, principal, load, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
