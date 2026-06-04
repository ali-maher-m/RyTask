'use client';

import { RequireAuth } from '@/components/require-auth';
import { ThemeToggle } from '@/components/theme-toggle';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useSession } from '@/lib/auth/session-context';
import { useOrg } from '@/lib/org/org-context';
import { Avatar, Button } from '@rytask/ui';
import { CheckSquare, FolderKanban, Inbox, LogOut, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import styles from './shell.module.css';

/**
 * Persistent authenticated shell (D6, FR-WEB-001). Reachable from every authed surface: sidebar
 * nav (My Work, Projects, Inbox, Search, Settings — entries hidden per the capability map), the
 * org + signed-in user, a theme toggle, and sign-out. Mounts the global command-palette affordance
 * (Cmd/Ctrl-K). Wraps children in `RequireAuth`; the client providers are mounted one level up.
 */
interface NavItem {
  href: string;
  label: string;
  icon: typeof CheckSquare;
  show: boolean;
}

function ShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, principal, signOut } = useSession();
  const { org } = useOrg();
  const { can } = useCapabilities();

  // Global command-palette affordance: Cmd/Ctrl-K opens search from any authed surface (FR-WEB-090).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/search');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  if (status === 'loading') {
    return <output className={styles.skeletonShell}>Loading your workspace…</output>;
  }

  const settingsHref = can('org:settings:write') ? '/settings/organization' : '/settings/tokens';
  const nav: NavItem[] = [
    { href: '/my-work', label: 'My Work', icon: CheckSquare, show: true },
    { href: '/projects', label: 'Projects', icon: FolderKanban, show: true },
    { href: '/inbox', label: 'Inbox', icon: Inbox, show: true },
    { href: '/search', label: 'Search', icon: Search, show: true },
    { href: settingsHref, label: 'Settings', icon: Settings, show: true },
  ];

  const userName = principal?.user.name ?? 'You';

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Link href="/my-work" aria-label="RyTask — My Work">
            <h1 className={styles.brandMark}>RyTask</h1>
          </Link>
        </div>
        <nav className={styles.nav} aria-label="Primary">
          {nav
            .filter((item) => item.show)
            .map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={16} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
        </nav>
        <div className={styles.footer}>
          <div className={styles.user}>
            <Avatar name={userName} />
            <div className={styles.userMeta}>
              <span className={styles.userName}>{userName}</span>
              <span className={styles.orgName}>{org?.name ?? ''}</span>
            </div>
          </div>
          <div className={styles.footerActions}>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              iconStart={<LogOut size={15} aria-hidden="true" />}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.search}
            onClick={() => router.push('/search')}
            aria-label="Search and commands"
          >
            <Search size={14} aria-hidden="true" />
            Search…
            <span className={styles.kbd}>⌘K</span>
          </button>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <ShellChrome>{children}</ShellChrome>
    </RequireAuth>
  );
}
