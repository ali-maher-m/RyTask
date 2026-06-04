import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './skeleton.module.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
}

/**
 * Loading placeholder — the `loading` surface-state primitive (component-contracts §A). A calm
 * token-tinted block with a gentle pulse that stops under `prefers-reduced-motion`. Decorative,
 * so it is hidden from assistive tech.
 */
export function Skeleton({ width, height = '1em', radius, className }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span className={cx(styles.skeleton, className)} style={style} aria-hidden="true" />;
}
