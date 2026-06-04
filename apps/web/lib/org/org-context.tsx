'use client';

import type { Organization, StatusCategory } from '@rytask/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { getCurrentOrg } from '../api/org';
import { useSession } from '../auth/session-context';

/**
 * Org context (D7, data-model §1.2, FR-WEB-004). The current tenant whose settings shape ALL
 * rendering: every date/time renders in `org.timezone` + `org.locale`, and a timezone change
 * re-renders dates org-wide. Figures are formatted here (locale-aware) and displayed in the
 * Geist Mono tabular face via the `Figure` primitive. Loaded once via TanStack Query.
 */
interface OrgContextValue {
  org: Organization | null;
  timezone: string;
  locale: string;
  /** Format an ISO timestamp in the org timezone + locale. */
  formatDate: (iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) => string;
  /** Format a YYYY-MM-DD calendar date in the org locale (no timezone shift). */
  formatDay: (day: string | null | undefined) => string;
  /** Format a number in the org locale (render inside <Figure> for the tabular mono face). */
  formatFigure: (n: number | null | undefined) => string;
  /** Today as `YYYY-MM-DD` in the org timezone (the boundary the overdue test uses, FR-WEB-062). */
  today: () => string;
  /**
   * Whether a work item is overdue **in the org timezone** (FR-WEB-062): a due date strictly before
   * today, on an item whose status category is not COMPLETED/CANCELLED. A completed/cancelled item is
   * never overdue (the flag clears on completion). Mirrors the server's `overdue` computation.
   */
  isOverdue: (
    dueDate: string | null | undefined,
    statusCategory: StatusCategory | null | undefined,
  ) => boolean;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const DEFAULT_TZ = 'UTC';
const DEFAULT_LOCALE = 'en-US';

export function OrgProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const { data: org } = useQuery({
    queryKey: ['org', 'current'],
    queryFn: getCurrentOrg,
    enabled: status === 'authenticated',
    staleTime: 5 * 60_000,
  });

  const value = useMemo<OrgContextValue>(() => {
    const timezone = org?.settings.timezone || DEFAULT_TZ;
    const locale = org?.settings.locale || DEFAULT_LOCALE;

    const formatDate: OrgContextValue['formatDate'] = (iso, opts) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...opts,
      }).format(d);
    };

    const formatDay: OrgContextValue['formatDay'] = (day) => {
      if (!day) return '';
      // A calendar date (YYYY-MM-DD) has no time-of-day, so render it without a timezone shift.
      const [y, m, d] = day.split('-').map(Number);
      if (!y || !m || !d) return day;
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(Date.UTC(y, m - 1, d)));
    };

    const formatFigure: OrgContextValue['formatFigure'] = (n) => {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      return new Intl.NumberFormat(locale).format(n);
    };

    // `en-CA` yields a sortable `YYYY-MM-DD`; computed in the org timezone so "today" flips at the
    // org's midnight, not the viewer's. Recomputed per call so it stays correct across midnight.
    const today: OrgContextValue['today'] = () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

    const isOverdue: OrgContextValue['isOverdue'] = (dueDate, statusCategory) => {
      if (!dueDate) return false;
      if (statusCategory === 'COMPLETED' || statusCategory === 'CANCELLED') return false;
      // Both are `YYYY-MM-DD`, so a lexical compare is a chronological compare.
      return dueDate < today();
    };

    return {
      org: org ?? null,
      timezone,
      locale,
      formatDate,
      formatDay,
      formatFigure,
      today,
      isOverdue,
    };
  }, [org]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
