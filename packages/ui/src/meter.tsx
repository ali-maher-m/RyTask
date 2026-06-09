import { cx } from './cx';
import { Figure } from './figure';
import styles from './meter.module.css';

export interface MeterProps {
  /** Time logged against the item, in whole seconds. */
  loggedSeconds: number;
  /** The estimate (plan), in seconds — or `null` when the item has no estimate (no over/under judgement). */
  estimateSeconds: number | null;
  /** Compact for Board/List rows; larger for the detail panel. */
  size?: 'row' | 'detail';
  /** Show the `"2h 15m of 8h"` figures (Geist-Mono tabular-nums) beneath the bar. */
  showFigures?: boolean;
  className?: string;
}

/** Whole-seconds → `"Hh Mm"` (e.g. 8100 → "2h 15m", 7200 → "2h", 1800 → "30m", 0 → "0m"). */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * The signature plan-vs-actual meter (FR-WEB-201, web-surfaces.md §1). A honey fill (`--time-actual`)
 * progresses toward the estimate's planned tick (`--time-plan`); once logged exceeds the estimate the
 * fill turns over-budget red (`--time-over`) and the figures call out the amount over. With no estimate
 * it renders a plain "logged" bar — no tick, never an over-budget state (no false judgement, SC-003).
 *
 * Token-only and flat (Principle VIII): no gradient/shadow/blur; the fill transition rides the motion
 * tokens, which collapse to 0ms under `prefers-reduced-motion`. Figures render through `<Figure>`.
 * A11y: `role="meter"` with `aria-valuenow/min/max` and a spoken `aria-label`.
 */
export function Meter({
  loggedSeconds,
  estimateSeconds,
  size = 'row',
  showFigures = false,
  className,
}: MeterProps) {
  const logged = Math.max(0, loggedSeconds);
  const hasEstimate = estimateSeconds != null && estimateSeconds > 0;
  const over = hasEstimate && logged > (estimateSeconds as number);

  // Scale the track to whichever is larger so an over-budget bar shows the plan tick *inside* it.
  const scale = hasEstimate ? Math.max(logged, estimateSeconds as number) : logged;
  const fillPct = scale > 0 ? Math.min(100, (logged / scale) * 100) : 0;
  const tickPct = hasEstimate ? ((estimateSeconds as number) / scale) * 100 : null;

  const loggedLabel = formatDuration(logged);
  const ariaLabel = hasEstimate
    ? `${loggedLabel} logged of ${formatDuration(estimateSeconds as number)} estimated`
    : `${loggedLabel} logged`;

  return (
    <div className={cx(styles.meter, styles[size], className)}>
      <div
        className={styles.track}
        role="meter"
        aria-valuenow={logged}
        aria-valuemin={0}
        aria-valuemax={hasEstimate ? (estimateSeconds as number) : Math.max(logged, 1)}
        aria-label={ariaLabel}
      >
        <div className={cx(styles.fill, over && styles.over)} style={{ width: `${fillPct}%` }} />
        {tickPct != null ? (
          <div className={styles.tick} style={{ left: `${tickPct}%` }} aria-hidden="true" />
        ) : null}
      </div>

      {showFigures ? (
        <div className={styles.figures}>
          <Figure>{loggedLabel}</Figure>
          {hasEstimate ? <span className={styles.muted}>of</span> : null}
          {hasEstimate ? <Figure>{formatDuration(estimateSeconds as number)}</Figure> : null}
          {!hasEstimate ? <span className={styles.muted}>logged</span> : null}
          {over ? (
            <span className={styles.overText}>
              <Figure>{formatDuration(logged - (estimateSeconds as number))}</Figure> over
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
