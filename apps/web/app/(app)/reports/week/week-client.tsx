'use client';

import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import { type MappedError, mapApiError } from '@/lib/api';
import { fetchWeeklySummary } from '@/lib/api/time';
import { digest, formatDay, formatHm } from '@/lib/report-text';
import type { WeeklySummary } from '@rytask/contracts';
import { Button, EmptyState, Figure, Meter, SplitBar } from '@rytask/ui';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './week-client.module.css';

/**
 * "My week" (`/reports/week`, M4 US3, web-surfaces §3). A week picker (◀/▶, never into the future),
 * the planned-vs-interruption split, the items the subject tracked time on (the shipped `<Meter>` for
 * tracked-beside-estimate), the items completed that week, and a one-click paste-ready "Copy as text"
 * digest. Figures-first, token-only; the digest is built from the same DTO the screen shows, so it can
 * never diverge (SC-004).
 */

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string) => new Date(`${s}T00:00:00`);
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
const isMondayString = (s: string | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && parseDay(s).getDay() === 1;

/** Hours-as-string estimate → seconds for the `<Meter>` (the M2 "interpret as hours" rule). */
function estimateSeconds(estimateValue: string | null): number | null {
  if (estimateValue == null) return null;
  const hours = Number(estimateValue);
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 3600) : null;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function WeekClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentMonday = useMemo(() => localDay(mondayOf(new Date())), []);
  const initial = searchParams.get('weekStart');
  const [weekStart, setWeekStart] = useState(isMondayString(initial) ? initial : currentMonday);

  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const weekEnd = localDay(addDays(parseDay(weekStart), 6));
  const isCurrentWeek = weekStart >= currentMonday; // cannot navigate into the future

  useEffect(() => {
    router.replace(`${pathname}?weekStart=${weekStart}`, { scroll: false });
  }, [weekStart, pathname, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      setSummary(await fetchWeeklySummary(weekStart));
    } catch (e) {
      setError(mapApiError(e));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const goPrev = () => setWeekStart(localDay(addDays(parseDay(weekStart), -7)));
  const goNext = () => {
    if (!isCurrentWeek) setWeekStart(localDay(addDays(parseDay(weekStart), 7)));
  };

  const copyDigest = async () => {
    if (!summary) return;
    const text = digest(summary);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older engines / insecure contexts: fall back to a hidden textarea + execCommand.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
  };

  const totals = summary?.totals;
  const interruptionPct = totals ? pct(totals.interruptionSeconds, totals.loggedSeconds) : 0;
  const plannedPct = totals && totals.loggedSeconds > 0 ? 100 - interruptionPct : 0;

  return (
    <main className={styles.page} data-testid="my-week">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>My week</h1>
          <p className={styles.subtitle}>
            Your tracked time and what you finished, one week at a time.
          </p>
        </div>
        <nav className={styles.tabs} aria-label="Report views">
          <Link className={styles.tab} href="/reports">
            Report
          </Link>
          <span className={`${styles.tab} ${styles.tabActive}`} aria-current="page">
            My week
          </span>
        </nav>
      </header>

      <div className={styles.weekPicker}>
        <Button
          variant="ghost"
          size="sm"
          onClick={goPrev}
          data-testid="week-prev"
          aria-label="Previous week"
          iconStart={<ChevronLeft size={16} aria-hidden="true" />}
        />
        <span className={styles.weekLabel} data-testid="week-label">
          <Figure>{formatDay(weekStart)}</Figure> – <Figure>{formatDay(weekEnd)}</Figure>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={goNext}
          data-testid="week-next"
          aria-label="Next week"
          disabled={isCurrentWeek}
          iconStart={<ChevronRight size={16} aria-hidden="true" />}
        />
      </div>

      {loading ? (
        <SurfaceLoading label="Loading your week…" />
      ) : error ? (
        <SurfaceFeedback error={error} onRetry={load} />
      ) : summary && totals ? (
        <>
          <section className={styles.headline} aria-label="Week totals">
            <div className={styles.figures}>
              <div className={styles.figureGroup}>
                <span className={styles.figureLabel}>Total tracked</span>
                <span data-testid="week-total">
                  <Figure className={styles.figureValue}>{formatHm(totals.loggedSeconds)}</Figure>
                </span>
              </div>
              <div className={styles.figureGroup}>
                <span className={styles.figureLabel}>Planned</span>
                <span data-testid="week-planned">
                  <Figure className={styles.figureValue}>{formatHm(totals.plannedSeconds)}</Figure>
                </span>
                <span className={styles.figurePct}>{plannedPct}%</span>
              </div>
              <div className={styles.figureGroup}>
                <span className={styles.figureLabel}>Interruptions</span>
                <span data-testid="week-interruption">
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
          </section>

          <section aria-labelledby="tracked-h">
            <h2 id="tracked-h" className={styles.sectionTitle}>
              What I tracked
            </h2>
            {summary.items.length === 0 ? (
              <p className={styles.muted}>No time tracked this week yet.</p>
            ) : (
              <ul className={styles.trackedList} data-testid="week-tracked">
                {summary.items.map((item) => (
                  <li key={item.workItemId} className={styles.trackedRow}>
                    <div className={styles.trackedHead}>
                      <Link
                        className={styles.itemKey}
                        href={`/projects/${item.projectId}/items/${item.key}`}
                        aria-label={`Open ${item.key} ${item.title}`}
                      >
                        <Figure>{item.key}</Figure>
                      </Link>
                      <span className={styles.trackedTitle}>{item.title}</span>
                      {item.completed ? (
                        <span className={styles.completedTick} title="Completed this week">
                          <Check size={14} aria-hidden="true" />
                          <span className="sr-only">completed this week</span>
                        </span>
                      ) : null}
                    </div>
                    <Meter
                      loggedSeconds={item.loggedSeconds}
                      estimateSeconds={estimateSeconds(item.estimateValue)}
                      showFigures
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="completed-h">
            <h2 id="completed-h" className={styles.sectionTitle}>
              Completed this week
            </h2>
            {summary.completedItems.length === 0 ? (
              <EmptyState
                title="Nothing marked done this week"
                description="Items you complete and are assigned to will show up here."
              />
            ) : (
              <ul className={styles.completedList} data-testid="week-completed">
                {summary.completedItems.map((item) => (
                  <li key={item.workItemId} className={styles.completedRow}>
                    <Link
                      className={styles.itemKey}
                      href={`/projects/${item.projectId}/items/${item.key}`}
                      aria-label={`Open ${item.key} ${item.title}`}
                    >
                      <Figure>{item.key}</Figure>
                    </Link>
                    <span className={styles.trackedTitle}>{item.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className={styles.copyRow}>
            <Button variant="secondary" onClick={() => void copyDigest()} data-testid="copy-week">
              Copy as text
            </Button>
            <span className={styles.copyFeedback} aria-live="polite" data-testid="copy-feedback">
              {copied ? 'Copied — paste it anywhere.' : ''}
            </span>
          </div>
        </>
      ) : null}
    </main>
  );
}
