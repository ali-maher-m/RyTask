import type { ReactNode } from 'react';
import styles from './auth-shell.module.css';

export { styles as authStyles };

/**
 * Centered card frame for the bare (unauthenticated) surfaces — setup, login, register, reset,
 * verify, invite. Token-only and theme-aware (the pre-paint script sets `data-theme`, so these
 * pages resolve the same tokens as the app without mounting the theme provider). The RyTask
 * wordmark is a brand mark, not a heading, so each page's own `<h1>` stays the document title.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>RyTask</div>
        {children}
      </div>
    </main>
  );
}
