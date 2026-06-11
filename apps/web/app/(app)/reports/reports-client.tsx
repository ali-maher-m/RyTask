'use client';

import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import { SourceBadge } from '@/components/work-item/source-badge';
import { type MappedError, listMemberships, listProjects, mapApiError } from '@/lib/api';
import {
  type ReportRange,
  type ReportScope,
  fetchInterruptionLedger,
  fetchReportOverview,
} from '@/lib/api/time';
import { downloadReportCsv } from '@/lib/csv';
import { formatHm, narrative } from '@/lib/report-text';
import type { InterruptionLedger, Membership, Project, ReportOverview } from '@rytask/contracts';
import { Button, EmptyState, Figure, SplitBar } from '@rytask/ui';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './reports-client.module.css';

/**
 * The flagship report (`/reports`, M4 US1/US2/US4, web-surfaces §2). Range/scope controls (synced to
 * the URL so a filtered report is shareable), a plain-language narrative, the planned-vs-interruption
 * headline split (Geist-Mono figures + a token-only `<SplitBar>` + percentages), a per-week table,
 * and the top time sinks. The interruption ledger (US2) and Export CSV (US4) extend this client.
 * Figures-first, flat, token-only (Principle VIII); the report never claims to be live — it refreshes
 * on control change and navigation.
 */

type Preset = 'this-week' | 'last-week' | 'last-2-weeks' | 'this-month' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  'this-week': 'This week',
  'last-week': 'Last week',
  'last-2-weeks': 'Last 2 weeks',
  'this-month': 'This month',
  custom: 'Custom',
};

const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` in the viewer's local calendar (presets are local; the server buckets in UTC, D5). */
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** The Monday of the local week containing `d`. */
const mondayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
};

/** A preset → an explicit inclusive `from`/`to` (the only thing the server sees, research D5). */
function computeRange(
  preset: Preset,
  customFrom: string,
  customTo: string,
  now = new Date(),
): ReportRange {
  const monday = mondayOf(now);
  switch (preset) {
    case 'last-week': {
      const m = addDays(monday, -7);
      return { from: localDay(m), to: localDay(addDays(m, 6)) };
    }
    case 'last-2-weeks': {
      const m = addDays(monday, -7);
      return { from: localDay(m), to: localDay(addDays(monday, 6)) };
    }
    case 'this-month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: localDay(first), to: localDay(last) };
    }
    case 'custom':
      return { from: customFrom, to: customTo };
    default:
      return { from: localDay(monday), to: localDay(addDays(monday, 6)) };
  }
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function ReportsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialPreset = (searchParams.get('preset') as Preset) || 'this-week';
  const [preset, setPreset] = useState<Preset>(
    PRESET_LABELS[initialPreset] ? initialPreset : 'this-week',
  );
  const [customFrom, setCustomFrom] = useState(searchParams.get('from') ?? '');
  const [customTo, setCustomTo] = useState(searchParams.get('to') ?? '');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '');
  const [userId, setUserId] = useState(searchParams.get('userId') ?? '');

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);

  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [ledger, setLedger] = useState<InterruptionLedger | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const scope: ReportScope = useMemo(
    () => ({ projectId: projectId || undefined, userId: userId || undefined }),
    [projectId, userId],
  );
  // Custom needs both dates before a fetch is meaningful.
  const rangeReady = preset !== 'custom' || (Boolean(customFrom) && Boolean(customTo));

  // Keep the URL in sync so a filtered report is shareable/bookmarkable within the app.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('preset', preset);
    if (preset === 'custom') {
      if (customFrom) params.set('from', customFrom);
      if (customTo) params.set('to', customTo);
    }
    if (projectId) params.set('projectId', projectId);
    if (userId) params.set('userId', userId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [preset, customFrom, customTo, projectId, userId, pathname, router]);

  // The selects are best-effort: if they fail to load, the report still works at the defaults.
  useEffect(() => {
    void Promise.all([listProjects(), listMemberships()])
      .then(([p, m]) => {
        setProjects(p);
        setMembers(m);
      })
      .catch(() => {
        /* leave the selects at "All projects" / "Everyone" */
      });
  }, []);

  const load = useCallback(async () => {
    if (!rangeReady) return;
    setLoading(true);
    setError(null);
    try {
      // The overview and the ledger share the active range/scope, so they fetch together and the
      // footer total can be shown to equal the headline interruption figure (SC-003).
      const [ov, led] = await Promise.all([
        fetchReportOverview(range, scope),
        fetchInterruptionLedger(range, scope),
      ]);
      setOverview(ov);
      setLedger(led);
    } catch (e) {
      setError(mapApiError(e));
      setOverview(null);
      setLedger(null);
    } finally {
      setLoading(false);
    }
  }, [range, scope, rangeReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = overview?.totals;
  const interruptionPct = totals ? pct(totals.interruptionSeconds, totals.loggedSeconds) : 0;
  const plannedPct = totals && totals.loggedSeconds > 0 ? 100 - interruptionPct : 0;

  return (
    <main className={styles.page} data-testid="reports">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Where did my time go?</h1>
          <p className={styles.subtitle}>
            Planned work versus interruptions, for the range and people you choose.
          </p>
        </div>
        <nav className={styles.tabs} aria-label="Report views">
          <span className={`${styles.tab} ${styles.tabActive}`} aria-current="page">
            Report
          </span>
          <Link className={styles.tab} href="/reports/week">
            My week
          </Link>
        </nav>
      </header>

      <div className={styles.controls} data-testid="report-controls">
        <label className={styles.control}>
          <span className={styles.controlLabel}>Range</span>
          <select
            className={styles.select}
            data-testid="range-preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </label>

        {preset === 'custom' ? (
          <div className={styles.customDates}>
            <label className={styles.control}>
              <span className={styles.controlLabel}>From</span>
              <input
                className={styles.select}
                data-testid="range-from"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className={styles.control}>
              <span className={styles.controlLabel}>To</span>
              <input
                className={styles.select}
                data-testid="range-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <label className={styles.control}>
          <span className={styles.controlLabel}>Project</span>
          <select
            className={styles.select}
            data-testid="project-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.control}>
          <span className={styles.controlLabel}>Person</span>
          <select
            className={styles.select}
            data-testid="person-select"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.exportSlot}>
          <Button
            variant="secondary"
            size="sm"
            data-testid="export-csv"
            disabled={!overview || !ledger}
            onClick={() => {
              if (overview && ledger) downloadReportCsv(overview, ledger);
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <SurfaceLoading label="Building your report…" />
      ) : error ? (
        <SurfaceFeedback error={error} onRetry={load} />
      ) : overview && totals ? (
        totals.loggedSeconds === 0 ? (
          <div data-testid="reports-empty">
            <EmptyState
              title="No time tracked in this range yet"
              description="Start a timer on any task — your report fills in here."
            />
          </div>
        ) : (
          <>
            <p className={styles.narrative} data-testid="report-narrative">
              {narrative(overview, ledger?.itemCount)}
            </p>

            <section className={styles.headline} aria-label="Time split">
              <div className={styles.figures}>
                <div className={styles.figureGroup}>
                  <span className={styles.figureLabel}>Total tracked</span>
                  <span data-testid="report-total">
                    <Figure className={styles.figureValue}>{formatHm(totals.loggedSeconds)}</Figure>
                  </span>
                </div>
                <div className={styles.figureGroup}>
                  <span className={styles.figureLabel}>Planned</span>
                  <span data-testid="report-planned">
                    <Figure className={styles.figureValue}>
                      {formatHm(totals.plannedSeconds)}
                    </Figure>
                  </span>
                  <span className={styles.figurePct}>{plannedPct}%</span>
                </div>
                <div className={styles.figureGroup}>
                  <span className={styles.figureLabel}>Interruptions</span>
                  <span data-testid="report-interruption">
                    <Figure className={styles.figureValue}>
                      {formatHm(totals.interruptionSeconds)}
                    </Figure>
                  </span>
                  <span className={styles.figurePct}>{interruptionPct}%</span>
                </div>
              </div>
              <SplitBar
                size="detail"
                plannedSeconds={totals.plannedSeconds}
                interruptionSeconds={totals.interruptionSeconds}
              />
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={`${styles.swatch} ${styles.swatchPlanned}`} aria-hidden="true" />
                  Planned
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={`${styles.swatch} ${styles.swatchInterruption}`}
                    aria-hidden="true"
                  />
                  Interruptions
                </span>
              </div>
            </section>

            <section aria-labelledby="by-week-h">
              <h2 id="by-week-h" className={styles.sectionTitle}>
                By week
              </h2>
              <table className={styles.table} data-testid="report-weeks">
                <caption className="sr-only">Tracked time by week</caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>
                      Week of
                    </th>
                    <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                      Logged
                    </th>
                    <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                      Planned
                    </th>
                    <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                      Interruptions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.weeks.map((w) => (
                    <tr key={w.weekStart} className={styles.row}>
                      <td className={styles.td}>
                        <Figure>{w.weekStart}</Figure>
                      </td>
                      <td className={`${styles.td} ${styles.num}`}>
                        <Figure>{formatHm(w.loggedSeconds)}</Figure>
                      </td>
                      <td className={`${styles.td} ${styles.num}`}>
                        <Figure>{formatHm(w.plannedSeconds)}</Figure>
                      </td>
                      <td className={`${styles.td} ${styles.num}`}>
                        <Figure>{formatHm(w.interruptionSeconds)}</Figure>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-labelledby="top-items-h">
              <h2 id="top-items-h" className={styles.sectionTitle}>
                Top time sinks
              </h2>
              {overview.topItems.length === 0 ? (
                <p className={styles.muted}>Nothing tracked against an item in this range.</p>
              ) : (
                <table className={styles.table} data-testid="report-top-items">
                  <caption className="sr-only">Items with the most tracked time</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.th}>
                        Item
                      </th>
                      <th scope="col" className={styles.th}>
                        Title
                      </th>
                      <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                        Logged
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.topItems.map((item) => (
                      <tr key={item.workItemId} className={styles.row}>
                        <td className={styles.td}>
                          <Link
                            className={styles.itemKey}
                            href={`/projects/${item.projectId}/items/${item.key}`}
                            aria-label={`Open ${item.key} ${item.title}`}
                          >
                            <Figure>{item.key}</Figure>
                          </Link>
                        </td>
                        <td className={styles.td}>{item.title}</td>
                        <td className={`${styles.td} ${styles.num}`}>
                          <Figure>{formatHm(item.loggedSeconds)}</Figure>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {ledger ? (
              <section aria-labelledby="ledger-h" data-testid="report-ledger">
                <h2 id="ledger-h" className={styles.sectionTitle}>
                  Interruption ledger
                </h2>
                {ledger.items.length === 0 ? (
                  <p className={styles.muted}>No interruptions in this range — nice.</p>
                ) : (
                  <table className={styles.table}>
                    <caption className="sr-only">Items that caused interruptions</caption>
                    <thead>
                      <tr>
                        <th scope="col" className={styles.th}>
                          Item
                        </th>
                        <th scope="col" className={styles.th}>
                          Title
                        </th>
                        <th scope="col" className={styles.th}>
                          From
                        </th>
                        <th scope="col" className={styles.th}>
                          Raised by
                        </th>
                        <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                          Entries
                        </th>
                        <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                          Hours
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.items.map((item) => (
                        <tr key={item.workItemId} className={styles.row}>
                          <td className={styles.td}>
                            <Link
                              className={styles.itemKey}
                              href={`/projects/${item.projectId}/items/${item.key}`}
                              aria-label={`Open ${item.key} ${item.title}`}
                            >
                              <Figure>{item.key}</Figure>
                            </Link>
                          </td>
                          <td className={styles.td}>{item.title}</td>
                          <td className={styles.td}>
                            <SourceBadge source={item.captureSource} />
                          </td>
                          <td className={styles.td}>
                            {item.reporter ? (
                              item.reporter.name
                            ) : (
                              <span className={styles.muted}>(removed user)</span>
                            )}
                          </td>
                          <td className={`${styles.td} ${styles.num}`}>
                            <Figure>{String(item.entryCount)}</Figure>
                          </td>
                          <td className={`${styles.td} ${styles.num}`}>
                            <Figure>{formatHm(item.seconds)}</Figure>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className={`${styles.td} ${styles.footTotal}`} colSpan={5}>
                          Total interruptions
                        </td>
                        <td
                          className={`${styles.td} ${styles.num} ${styles.footTotal}`}
                          data-testid="ledger-total"
                        >
                          <Figure>{formatHm(ledger.totalSeconds)}</Figure>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}

                {ledger.weeks.length > 0 ? (
                  <div className={styles.subSection}>
                    <h3 className={styles.subTitle}>Interruptions by week</h3>
                    <table className={styles.table}>
                      <caption className="sr-only">Interruption time by week</caption>
                      <thead>
                        <tr>
                          <th scope="col" className={styles.th}>
                            Week of
                          </th>
                          <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                            Items
                          </th>
                          <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                            Hours
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.weeks.map((w) => (
                          <tr key={w.weekStart} className={styles.row}>
                            <td className={styles.td}>
                              <Figure>{w.weekStart}</Figure>
                            </td>
                            <td className={`${styles.td} ${styles.num}`}>
                              <Figure>{String(w.itemCount)}</Figure>
                            </td>
                            <td className={`${styles.td} ${styles.num}`}>
                              <Figure>{formatHm(w.seconds)}</Figure>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )
      ) : null}
    </main>
  );
}
