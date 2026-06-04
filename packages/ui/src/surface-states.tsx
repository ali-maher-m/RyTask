import { AlertTriangle, Inbox, Lock, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { cx } from './cx';
import styles from './surface-states.module.css';

interface SurfaceStateBaseProps {
  title?: ReactNode;
  description?: ReactNode;
  /** A recovery affordance (CTA). */
  action?: ReactNode;
  icon?: ReactNode;
  iconError?: boolean;
}

/**
 * Shared surface-state container (FR-WEB-102). Every data surface renders a loading / empty /
 * forbidden / not-found / error state with plain, kind copy and a recovery path. The four named
 * exports below give consistent defaults; copy stays sentence-case and jargon-free (NFR-WEB-004).
 */
function SurfaceState({ title, description, action, icon, iconError }: SurfaceStateBaseProps) {
  return (
    <div className={styles.surface}>
      {icon ? <span className={cx(styles.icon, iconError && styles.iconError)}>{icon}</span> : null}
      {title ? <p className={styles.title}>{title}</p> : null}
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

export interface EmptyStateProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Render-prop or node for the primary next-step CTA. */
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    <SurfaceState
      icon={icon ?? <Inbox size={20} aria-hidden="true" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We couldn’t load this just now. Please try again.',
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <SurfaceState
      icon={<AlertTriangle size={20} aria-hidden="true" />}
      iconError
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null
      }
    />
  );
}

export interface ForbiddenStateProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function ForbiddenState({
  title = 'You don’t have access to this',
  description = 'Ask an owner or admin if you think you should. Nothing here is shown to you.',
  action,
}: ForbiddenStateProps) {
  return (
    <SurfaceState
      icon={<Lock size={20} aria-hidden="true" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export interface NotFoundStateProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function NotFoundState({
  title = 'We couldn’t find that',
  description = 'It may have been moved or removed, or the link isn’t for this workspace.',
  action,
}: NotFoundStateProps) {
  return (
    <SurfaceState
      icon={<SearchX size={20} aria-hidden="true" />}
      title={title}
      description={description}
      action={action}
    />
  );
}
