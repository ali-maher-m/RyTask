'use client';

import {
  type ReactNode,
  type SelectHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { cx } from './cx';
import styles from './menu.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

/**
 * Token-styled native `<select>` (component-contracts §A). A real `<select>` keeps full keyboard
 * navigation and platform a11y for free; only the chrome is restyled with semantic tokens.
 */
export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select className={cx(styles.select, className)} {...rest}>
      {children}
    </select>
  );
}

export interface MenuItemSpec {
  id: string;
  label: ReactNode;
  iconStart?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface DropdownMenuProps {
  /** Render-prop trigger; receives props to spread on a button-like element. */
  trigger: (props: {
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
  }) => ReactNode;
  items: MenuItemSpec[];
  align?: 'start' | 'end';
  label?: string;
}

/**
 * Accessible dropdown menu (component-contracts §A). `role="menu"` with `role="menuitem"` children,
 * arrow-key roving focus, Home/End, Escape-to-close (focus returns to the trigger), and
 * click-outside dismissal. Selecting an item runs its `onSelect` and closes. Visuals are token-only.
 */
export function DropdownMenu({ trigger, items, align = 'start', label }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) {
      const trigger = rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]');
      trigger?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus the first enabled item when the menu opens.
    const first = items.findIndex((i) => !i.disabled);
    if (first >= 0) itemRefs.current[first]?.focus();

    function onDocPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [open, items]);

  function focusByOffset(from: number, delta: number) {
    const n = items.length;
    for (let step = 1; step <= n; step += 1) {
      const idx = (from + delta * step + n * step) % n;
      if (!items[idx]?.disabled) {
        itemRefs.current[idx]?.focus();
        return;
      }
    }
  }

  function onItemKeyDown(e: React.KeyboardEvent, index: number) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusByOffset(index, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusByOffset(index, -1);
        break;
      case 'Home':
        e.preventDefault();
        focusByOffset(-1, 1);
        break;
      case 'End':
        e.preventDefault();
        focusByOffset(0, -1);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={styles.menu} ref={rootRef}>
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx(styles.panel, align === 'end' && styles.panelRight)}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={cx(styles.item, item.danger && styles.itemDanger)}
              disabled={item.disabled}
              tabIndex={-1}
              onKeyDown={(e) => onItemKeyDown(e, index)}
              onClick={() => {
                item.onSelect?.();
                close(true);
              }}
            >
              {item.iconStart ? <span aria-hidden="true">{item.iconStart}</span> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
