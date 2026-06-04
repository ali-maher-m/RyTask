import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { cx } from './cx';
import styles from './input.module.css';

interface FieldShared {
  label?: ReactNode;
  /** Helper text shown under the control (wired via aria-describedby). */
  hint?: ReactNode;
  /** Error text; when set, the control is marked invalid + described by it. */
  error?: ReactNode;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldShared {}

/**
 * Labelled text input (component-contracts §A). The label is associated by `htmlFor`/`id`; an
 * `error` flips the control to the `--error` state and is exposed via `aria-describedby` +
 * `aria-invalid` for assistive tech (NFR-WEB-002). Focus uses the brand `--ring`.
 */
export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        className={cx(styles.control, error ? styles.invalid : null, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(errorId, hintId) || undefined}
        {...rest}
      />
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldShared {}

/** Labelled multi-line input; same accessible field wiring as {@link Input}. */
export function Textarea({ label, hint, error, id, className, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={fieldId}
        className={cx(styles.control, styles.textarea, error ? styles.invalid : null, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(errorId, hintId) || undefined}
        {...rest}
      />
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
