import { cx } from './cx';
import styles from './status.module.css';

export type StatusCategory = 'backlog' | 'todo' | 'progress' | 'review' | 'done' | 'canceled';

const STATUS_TOKEN: Record<StatusCategory, string> = {
  backlog: 'var(--status-backlog)',
  todo: 'var(--status-todo)',
  progress: 'var(--status-progress)',
  review: 'var(--status-review)',
  done: 'var(--status-done)',
  canceled: 'var(--status-canceled)',
};

export interface StatusDotProps {
  category: StatusCategory;
  /** Render as a hollow ring (e.g. unstarted) instead of a filled dot. */
  ring?: boolean;
  className?: string;
}

/** Issue-workflow status dot; maps a category to its `--status-*` token (component-contracts §A). */
export function StatusDot({ category, ring = false, className }: StatusDotProps) {
  const color = STATUS_TOKEN[category];
  return (
    <span
      className={cx(styles.dot, ring && styles.dotRing, className)}
      style={ring ? { color } : { background: color }}
      aria-hidden="true"
    />
  );
}

const AVATAR_TONES = [
  'var(--primary-soft)',
  'var(--info-soft)',
  'var(--success-soft)',
  'var(--accent-soft)',
  'var(--warning-soft)',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  if (parts.length === 0) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? 'var(--surface-sunken)';
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * User avatar (component-contracts §A). Falls back to initials on a token-tinted background
 * (deterministic per name) when there is no image. The background is always a semantic token.
 */
export function Avatar({ name, src, size = 'sm', className }: AvatarProps) {
  const cls = cx(styles.avatar, size === 'lg' && styles.avatarLg, className);
  if (src) {
    return (
      <span className={cls}>
        <img className={styles.avatarImg} src={src} alt={name} />
      </span>
    );
  }
  return (
    <span className={cls} style={{ background: toneFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
