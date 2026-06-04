'use client';

import { type ReactNode, useId, useState } from 'react';
import styles from './tooltip.module.css';

export interface TooltipProps {
  /** The tooltip text — typically the "reason" a control is disabled. */
  content: ReactNode;
  children: ReactNode;
}

/**
 * Lightweight tooltip (component-contracts §A). Shows on hover and keyboard focus and is exposed
 * to assistive tech via `aria-describedby`/`role="tooltip"`. Listeners live on the wrapper so it
 * also works around a disabled control (which itself emits no pointer/focus events) — this is how
 * the capability map surfaces the "why this is disabled" reason (FR-WEB-100). Token-only.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open ? (
        <span role="tooltip" id={id} className={styles.bubble}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
