import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/**
 * Minimal accessible button: a native <button> (keyboard-focusable, screen-reader
 * friendly) with an explicit default type. Server-component safe (no client hooks).
 * The non-technical-UX promise ("Albert/Marissa test") starts with semantic HTML.
 */
export function Button({ children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} {...rest}>
      {children}
    </button>
  );
}
