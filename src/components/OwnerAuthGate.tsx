'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { OWNER_EMAIL, PRODUCTION_APP_URL, isOwnerEmail } from '@/lib/owner-auth';
import { supabase } from '@/lib/supabase';

type AuthState = 'loading' | 'signed-out' | 'authorized';

const SEND_COOLDOWN_MS = 60_000;
const LAST_SEND_KEY = 'herramientas-otp-last-send';

function remainingCooldown() {
  if (typeof window === 'undefined') return 0;
  const last = Number(window.localStorage.getItem(LAST_SEND_KEY) || 0);
  return Math.max(0, Math.ceil((last + SEND_COOLDOWN_MS - Date.now()) / 1000));
}

function markCodeSent() {
  window.localStorage.setItem(LAST_SEND_KEY, String(Date.now()));
}

function friendlyAuthError(message: string) {
  if (/rate limit/i.test(message)) return 'El código ya está en el correo. Escríbelo aquí.';
  if (/otp/i.test(message) && /expired|invalid/i.test(message)) return 'Código no válido. Pide otro.';
  return message;
}

function cleanAuthParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  url.searchParams.delete('error_code');
  url.hash = '';
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

function readUrlError() {
  if (typeof window === 'undefined') return '';
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return String(
    search.get('error_description')
    || search.get('error')
    || hash.get('error_description')
    || hash.get('error')
    || '',
  ).replace(/\+/g, ' ');
}

export default function OwnerAuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setState('signed-out');
      setNotice('Falta la conexión con Supabase.');
      return;
    }

    async function boot() {
      const urlError = readUrlError();
      const url = new URL(window.location.href);
      const authCode = url.searchParams.get('code');
      if (authCode) {
        const { error } = await supabase!.auth.exchangeCodeForSession(authCode);
        if (!active) return;
        if (error) setNotice(friendlyAuthError(error.message));
      }
      const { data: { session } } = await supabase!.auth.getSession();
      if (!active) return;
      cleanAuthParams();
      if (session?.user && isOwnerEmail(session.user.email)) {
        setState('authorized');
        return;
      }
      if (session?.user) {
        await supabase!.auth.signOut();
        setNotice('Este usuario no tiene acceso.');
      } else if (urlError) {
        setNotice(urlError);
      }
      setState('signed-out');
    }

    void boot();
    setWait(remainingCooldown());
    const cooldownTimer = window.setInterval(() => setWait(remainingCooldown()), 1000);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user && isOwnerEmail(session.user.email)) {
        setState('authorized');
        setNotice('');
        return;
      }
      setState((current) => (current === 'loading' ? current : 'signed-out'));
    });
    return () => {
      active = false;
      window.clearInterval(cooldownTimer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function sendCode() {
    if (!supabase) return;
    if (remainingCooldown() > 0) {
      setNotice('El código ya está en el correo. Escríbelo aquí.');
      return;
    }
    setBusy(true);
    setNotice('');
    const { error } = await supabase.auth.signInWithOtp({
      email: OWNER_EMAIL,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${PRODUCTION_APP_URL}/`,
      },
    });
    markCodeSent();
    setWait(remainingCooldown());
    setBusy(false);
    setNotice(error ? friendlyAuthError(error.message) : 'Código enviado.');
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const raw = code.trim();
    if (!raw) {
      setNotice('Escribe el código.');
      return;
    }
    setBusy(true);
    setNotice('');
    const token = raw.replace(/\s+/g, '');
    const { error } = await supabase.auth.verifyOtp({
      email: OWNER_EMAIL,
      token,
      type: 'email',
    });
    setBusy(false);
    if (error) {
      setNotice(friendlyAuthError(error.message));
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && isOwnerEmail(session.user.email)) {
      setState('authorized');
      return;
    }
    setNotice('El código no abrió la sesión. Pide otro.');
  }

  if (state === 'authorized') return <>{children}</>;
  if (state === 'loading') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Entrando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">TS Operaciones</p>
      <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight">Entra con tu correo</h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        Te llega un correo de Supabase: Your sign-in link. Abre Sign in. Si viene un número de 6 cifras, escríbelo aquí.
      </p>
      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={busy || wait > 0}
          className="inline-flex h-11 items-center rounded-full bg-[var(--text-primary)] px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Enviando…' : wait > 0 ? `Espera ${wait}s` : 'Enviar código'}
        </button>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            void verifyCode(event);
          }}
        >
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Código</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm tracking-[0.24em] outline-none"
            />
          </label>
          {notice ? <p className="text-sm text-[var(--text-secondary)]">{notice}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 items-center rounded-full border border-[var(--border)] px-5 text-sm font-semibold text-[var(--text-secondary)] disabled:opacity-50"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

export function OwnerSessionBar() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready || !supabase) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void supabase!.auth.signOut();
      }}
      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
    >
      Salir
    </button>
  );
}
