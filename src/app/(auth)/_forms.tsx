"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

// Demo login hint: shown only outside production unless explicitly opted in.
const SHOW_DEMO =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DEMO === "1";
import {
  loginAction,
  signUpAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type FormState,
} from "@/app/actions/auth";

const initial: FormState = { ok: false };

function Alert({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[14px] text-[var(--danger)]">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-[14px] text-[var(--success)]">
        {state.message}
        {state.token && (
          <p className="mt-1 break-all font-mono text-[12px] text-[var(--text-muted)]">
            dev token: {state.token}
          </p>
        )}
      </div>
    );
  return null;
}

export function GoogleButton({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <>
      <a href="/api/auth/signin/google" className="block">
        <Button type="button" variant="secondary" className="w-full">
          <GoogleGlyph /> Continue with Google
        </Button>
      </a>
      <div className="my-5 flex items-center gap-3 text-[12px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        or
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

export function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[27px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[14.5px] text-[var(--text-muted)]">
          Sign in to pick up where your team left off.
        </p>
      </div>
      <GoogleButton enabled={googleEnabled} />
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <Alert state={state} />
        <Button type="submit" className="w-full" loading={pending}>
          Sign in
        </Button>
      </form>
      <div className="flex items-center justify-between text-[14px]">
        <Link href="/forgot" className="font-medium text-[var(--primary)] hover:underline">
          Forgot password?
        </Link>
        <span className="text-[var(--text-muted)]">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-[var(--primary)] hover:underline">
            Create account
          </Link>
        </span>
      </div>
      {SHOW_DEMO && (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px] text-[var(--text-muted)]">
          Demo — <span className="font-mono text-[var(--text)]">demo@multipoststudio.app</span> / <span className="font-mono text-[var(--text)]">demo1234</span>
        </p>
      )}
    </div>
  );
}

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(signUpAction, initial);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[27px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Keep your social <span className="mps-serif">on rhythm</span>
        </h1>
        <p className="mt-1.5 text-[14.5px] text-[var(--text-muted)]">
          Start your 14-day free trial — no card required.
        </p>
      </div>
      <GoogleButton enabled={googleEnabled} />
      <form action={action} className="space-y-4">
        <Field label="Full name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required placeholder="Avery Quinn" />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters">
          <Input id="password" name="password" type="password" autoComplete="new-password" required placeholder="••••••••" />
        </Field>
        <Alert state={state} />
        <Button type="submit" className="w-full" loading={pending}>
          Create account
        </Button>
      </form>
      <p className="text-[14px] text-[var(--text-muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--primary)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[27px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">Reset your password</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">We&apos;ll send a reset link to your email.</p>
      </div>
      <form action={action} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Alert state={state} />
        <Button type="submit" className="w-full" loading={pending}>
          Send reset link
        </Button>
      </form>
      {state.token && (
        <Link href={`/reset?token=${state.token}`} className="block text-[14px] text-[var(--primary)] hover:underline">
          Continue to reset →
        </Link>
      )}
      <Link href="/login" className="block text-[14px] text-[var(--text-muted)] hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[27px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">Choose a new password</h1>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" htmlFor="password" hint="At least 8 characters">
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Alert state={state} />
        <Button type="submit" className="w-full" loading={pending}>
          Update password
        </Button>
      </form>
      {state.ok && (
        <Link href="/login" className="block text-[14px] text-[var(--primary)] hover:underline">
          Go to sign in →
        </Link>
      )}
    </div>
  );
}
