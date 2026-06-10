import { Input, Textarea } from '@rytask/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for the labelled `<Input>` / `<Textarea>` (component-contracts §A). Asserts the
 * label↔control association, the error state (`aria-invalid` + `role="alert"` +
 * `aria-describedby`), and the hint wiring — the accessible field contract for assistive tech.
 */
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };

describe('Input', () => {
  it('associates the label with the control', () => {
    render(<Input label="Email" defaultValue="a@b.test" />);
    const field = screen.getByLabelText('Email') as HTMLInputElement;
    expect(field.tagName).toBe('INPUT');
    expect(field.value).toBe('a@b.test');
  });

  it('error → aria-invalid + an alert described by the control', () => {
    render(<Input label="Email" error="Required" />);
    const field = screen.getByLabelText('Email');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Required');
    expect(field.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('hint is wired via aria-describedby when there is no error', () => {
    render(<Input label="Name" hint="Your full name" />);
    const field = screen.getByLabelText('Name');
    const describedBy = field.getAttribute('aria-describedby') ?? '';
    expect(describedBy).not.toBe('');
    expect(document.getElementById(describedBy)?.textContent).toBe('Your full name');
  });

  it('Textarea shares the labelled-field contract', () => {
    render(<Textarea label="Notes" error="Too long" />);
    const field = screen.getByLabelText('Notes');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Input label="Email" hint="We never share it" />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });
});
