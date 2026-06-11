import { cx } from './cx';
import styles from './split-bar.module.css';

export interface SplitBarProps {
  /** Planned (non-interruption) time, in whole seconds — the honey segment. */
  plannedSeconds: number;
  /** Interruption time, in whole seconds — the amber segment. */
  interruptionSeconds: number;
  /** Compact for header rows; larger for the report headline. */
  size?: 'row' | 'detail';
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
 * The headline planned-vs-interruption split (M4, web-surfaces §2/§5, research D12). One flat
 * two-segment bar: planned in honey (`--time-actual`, the brand's time/momentum hue), interruptions
 * in amber (`--warning`, dark ink) — the two segments always sum to the logged total
 * (`planned + interruption === logged`, SC-002). Token-only and flat (Principle VIII): no gradient,
 * shadow, or blur; `--time-over` red stays reserved for the over-estimate `<Meter>`, never used here.
 *
 * Colour is never the only signal: the bar carries a spoken `aria-label` ("Planned 2h 15m,
 * interruptions 45m"), and the caller renders the figures + percentages adjacent (WCAG AA). With no
 * logged time it renders an empty track.
 */
export function SplitBar({
  plannedSeconds,
  interruptionSeconds,
  size = 'row',
  className,
}: SplitBarProps) {
  const planned = Math.max(0, plannedSeconds);
  const interruption = Math.max(0, interruptionSeconds);
  const total = planned + interruption;
  const plannedPct = total > 0 ? (planned / total) * 100 : 0;
  const interruptionPct = total > 0 ? (interruption / total) * 100 : 0;

  const ariaLabel =
    total > 0
      ? `Planned ${formatDuration(planned)}, interruptions ${formatDuration(interruption)}`
      : 'No time tracked';

  return (
    <div
      className={cx(styles.bar, styles[size], className)}
      role="img"
      aria-label={ariaLabel}
    >
      {planned > 0 ? (
        <div className={styles.planned} style={{ width: `${plannedPct}%` }} aria-hidden="true" />
      ) : null}
      {interruption > 0 ? (
        <div
          className={styles.interruption}
          style={{ width: `${interruptionPct}%` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
