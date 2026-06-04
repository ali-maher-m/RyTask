'use client';

import type { Role } from '@rytask/contracts';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { type Capability, type CapabilityCtx, can as canFor, reason } from './capabilities';
import { useSession } from './session-context';

/**
 * Capability context (D9). Binds the capability map to the signed-in principal's role and exposes
 * `can(cap, ctx?)` + `reason(cap)` for cosmetic gating across every surface. A role change
 * mid-session is reflected on the next navigation (the session re-fetches `whoami`). Until a
 * principal resolves, capabilities default to the most restrictive role so nothing leaks.
 */
interface CapabilityContextValue {
  role: Role;
  can: (cap: Capability, ctx?: CapabilityCtx) => boolean;
  reason: (cap: Capability) => string;
}

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const { principal } = useSession();
  const role: Role = principal?.role ?? 'VIEWER';

  const value = useMemo<CapabilityContextValue>(
    () => ({
      role,
      can: (cap, ctx) => canFor(role, cap, ctx),
      reason,
    }),
    [role],
  );

  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useCapabilities(): CapabilityContextValue {
  const ctx = useContext(CapabilityContext);
  if (!ctx) throw new Error('useCapabilities must be used within CapabilityProvider');
  return ctx;
}
