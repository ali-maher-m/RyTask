'use client';

import { type Theme, useTheme } from '@/lib/theme/theme-context';
import { Button } from '@rytask/ui';
import { Monitor, Moon, Sun } from 'lucide-react';

/**
 * Header theme toggle (D3). Cycles light → dark → system; the choice is persisted and applied as
 * `data-theme` on `<html>` (both themes resolve from the same tokens — Principle VIII). The
 * current mode is announced for assistive tech via the accessible label.
 */
const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<Theme, string> = {
  light: 'Theme: light',
  dark: 'Theme: dark',
  system: 'Theme: match system',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${LABEL[theme]}. Switch theme.`}
      title={LABEL[theme]}
      onClick={() => setTheme(NEXT[theme])}
    >
      <Icon size={16} aria-hidden="true" />
    </Button>
  );
}
