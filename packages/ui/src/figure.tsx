import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './figure.module.css';

export interface FigureProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

/**
 * Wraps every figure — times, estimates, counts, dates, and human keys/IDs — in the Geist Mono
 * `tabular-nums` face so numbers align and read honestly (FR-WEB-004, Principle VIII). Render via
 * the org formatters (OrgContext) for locale/timezone-correct values.
 */
export function Figure({ children, className, title }: FigureProps) {
  return (
    <span className={cx(styles.figure, className)} title={title}>
      {children}
    </span>
  );
}
