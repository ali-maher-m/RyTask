'use client';

import { createWorkItem } from '@/lib/api';
import { type TokenKind, previewTokens } from '@/lib/quick-add/tokenizer';
import type { UnresolvedToken, WorkItem } from '@rytask/contracts';
import { Button, Chip, Figure } from '@rytask/ui';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import styles from './quick-add.module.css';

/**
 * Quick-add control (US2, FR-WEB-020/021, SC-002). One line with inline shorthand
 * `@assignee #label !priority ^date`. The client renders recognized tokens as chips live (preview
 * only — the SERVER is the parser of record, D13); on submit it POSTs `{ projectId, quickAdd }` and
 * surfaces the server's `meta.unresolved` inline for correction — tokens are never dropped and
 * never block capture. The new item appears with its human key without a reload.
 */
interface QuickAddProps {
  projectId: string;
  onCreated?: (item: WorkItem) => void;
}

const DOT: Record<TokenKind, string> = {
  assignee: 'var(--info)',
  label: 'var(--accent)',
  priority: 'var(--primary)',
  date: 'var(--status-progress)',
};

export function QuickAdd({ projectId, onCreated }: QuickAddProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ key: string; title: string } | null>(null);
  const [unresolved, setUnresolved] = useState<UnresolvedToken[]>([]);
  const [error, setError] = useState<string | null>(null);

  const chips = useMemo(() => previewTokens(value).chips, [value]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const quickAdd = value.trim();
    if (!quickAdd || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createWorkItem({ projectId, quickAdd });
      setCreated({ key: res.data.key, title: res.data.title });
      setUnresolved(res.meta?.unresolved ?? []);
      setValue('');
      onCreated?.(res.data);
    } catch {
      setError('We couldn’t capture that just now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.root} onSubmit={submit} aria-label="Quick add work item">
      <div className={styles.row}>
        <input
          type="text"
          className={styles.input}
          data-testid="quick-add-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Capture a task…  @assignee #label !priority ^date"
          aria-label="Quick add"
          disabled={busy}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!value.trim()}
          iconStart={<Plus size={14} aria-hidden="true" />}
        >
          Add
        </Button>
      </div>

      {chips.length > 0 ? (
        <div className={styles.chips} aria-label="Recognized tokens">
          {chips.map((chip) => (
            <Chip key={`${chip.kind}:${chip.raw}`} dotColor={DOT[chip.kind]}>
              {chip.raw}
            </Chip>
          ))}
        </div>
      ) : (
        <p className={styles.hint}>
          Type a title and add{' '}
          <span className={styles.hintMono}>@assignee #label !priority ^date</span> to structure it.
        </p>
      )}

      {created ? (
        <output className={styles.created}>
          Captured <Figure>{created.key}</Figure> — {created.title}
        </output>
      ) : null}

      {unresolved.length > 0 ? (
        <ul className={styles.unresolved} aria-label="Tokens to fix">
          {unresolved.map((u) => (
            <li key={`${u.kind}:${u.token}`}>
              We couldn’t match the {u.kind} <Figure>{u.token}</Figure> — it’s saved on the item so
              you can fix it there.
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
