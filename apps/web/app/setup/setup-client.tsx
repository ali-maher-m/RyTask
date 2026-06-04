'use client';

import { AuthShell, authStyles as s } from '@/components/auth-shell';
import { ApiError, bootstrap, getSetupState, storeSession } from '@/lib/api';
import { Button, Input } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

/**
 * First-run wizard (US1, FR-WEB-010). Plain-language, ≤ 5 short steps to a usable, owned
 * workspace — no jargon (the "Albert/Marissa test"). It asks `GET /setup`; if an org already
 * exists it shows a friendly "already set up" notice that routes to sign-in. Otherwise it collects
 * the owner's name/email, a password, and an organization name, then `POST /setup` to atomically
 * create everything and sign the owner in, landing in a starter project. Restyled to design tokens.
 */
type Phase = 'checking' | 'ready' | 'already-set-up' | 'creating' | 'done';

const STEPS = ['About you', 'Pick a password', 'Name your team', 'Create'] as const;

export function SetupClient() {
  const router = useRouter();
  const formId = useId();
  const [phase, setPhase] = useState<Phase>('checking');
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSetupState()
      .then((state) => {
        if (active) setPhase(state.available ? 'ready' : 'already-set-up');
      })
      .catch(() => {
        if (active) setPhase('ready');
      });
    return () => {
      active = false;
    };
  }, []);

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (name.trim().length === 0) return 'Please tell us your name.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Please enter a valid email address.';
    }
    if (current === 1 && password.length < 8) {
      return 'Use at least 8 characters for your password.';
    }
    if (current === 2 && orgName.trim().length === 0) {
      return 'Give your team or company a name.';
    }
    return null;
  }

  function next() {
    const invalid = validateStep(step);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((value) => Math.max(value - 1, 0));
  }

  async function create() {
    for (let i = 0; i < 3; i += 1) {
      const invalid = validateStep(i);
      if (invalid) {
        setStep(i);
        setError(invalid);
        return;
      }
    }
    setPhase('creating');
    setError(null);
    try {
      const result = await bootstrap({
        organizationName: orgName.trim(),
        ownerName: name.trim(),
        ownerEmail: email.trim(),
        ownerPassword: password,
      });
      storeSession(result);
      setPhase('done');
      router.push('/');
    } catch (e) {
      setPhase('ready');
      if (e instanceof ApiError && e.status === 409) {
        setPhase('already-set-up');
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  if (phase === 'checking') {
    return (
      <AuthShell>
        <h1 className={s.title}>Getting things ready…</h1>
        <p className={s.subtitle}>One moment.</p>
      </AuthShell>
    );
  }

  if (phase === 'already-set-up') {
    return (
      <AuthShell>
        <h1 className={s.title}>You're all set up</h1>
        <p className={s.subtitle}>
          This workspace already has an account. Sign in to pick up where you left off.
        </p>
        <Link href="/login">Go to sign in</Link>
      </AuthShell>
    );
  }

  const busy = phase === 'creating';

  return (
    <AuthShell>
      <h1 className={s.title}>Welcome to RyTask</h1>
      <p className={s.subtitle}>Let's set up your workspace. It only takes a minute.</p>

      <p className={s.steps} aria-live="polite">
        Step {step + 1} of {STEPS.length}: <strong>{STEPS[step]}</strong>
      </p>

      <form
        className={s.form}
        aria-labelledby={`${formId}-heading`}
        onSubmit={(e) => {
          e.preventDefault();
          if (step === STEPS.length - 1) {
            void create();
          } else {
            next();
          }
        }}
      >
        <h2 id={`${formId}-heading`}>{STEPS[step]}</h2>

        {step === 0 ? (
          <>
            <Input
              label="Your name"
              autoComplete="name"
              required
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Your email"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        ) : null}

        {step === 1 ? (
          <Input
            label="Choose a password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters."
          />
        ) : null}

        {step === 2 ? (
          <Input
            label="What should we call your team?"
            autoComplete="organization"
            required
            value={orgName}
            disabled={busy}
            onChange={(e) => setOrgName(e.target.value)}
          />
        ) : null}

        {step === 3 ? (
          <div>
            <p>Here's what we'll create:</p>
            <ul className={s.reviewList}>
              <li>
                Your owner account for <strong>{name || 'you'}</strong> ({email})
              </li>
              <li>
                A workspace for <strong>{orgName}</strong>
              </li>
              <li>A starter project so you can begin right away</li>
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={s.actions}>
          {step > 0 ? (
            <Button variant="secondary" onClick={back} disabled={busy}>
              Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button type="submit" variant="primary" disabled={busy}>
              Continue
            </Button>
          ) : (
            <Button type="submit" variant="primary" loading={busy}>
              {busy ? 'Creating your workspace…' : 'Create my workspace'}
            </Button>
          )}
        </div>
      </form>

      <p className={s.footer}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
