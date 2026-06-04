import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './badge.module.css';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/** Small status/label badge; `tone` maps to the semantic state tokens (component-contracts §A). */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return <span className={cx(styles.badge, styles[tone], className)}>{children}</span>;
}

export interface ChipProps {
  children: ReactNode;
  /** Optional leading dot color, e.g. a label color — must be a var(--*) token value. */
  dotColor?: string;
  iconStart?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

/**
 * Chip for labels, priorities, and quick-add tokens (component-contracts §A). Optional leading
 * dot (caller passes a token value), optional remove button (keyboard-operable). Token-only.
 */
export function Chip({
  children,
  dotColor,
  iconStart,
  onRemove,
  removeLabel = 'Remove',
  className,
}: ChipProps) {
  return (
    <span className={cx(styles.chip, className)}>
      {dotColor ? (
        <span className={styles.chipDot} style={{ background: dotColor }} aria-hidden="true" />
      ) : null}
      {iconStart ? <span aria-hidden="true">{iconStart}</span> : null}
      {children}
      {onRemove ? (
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={removeLabel}>
          <X size={11} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
