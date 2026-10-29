'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACCESS_ROLE_LABEL, type AccessRole } from '@/lib/access-model';

export type AccessMe = {
  email: string;
  name: string;
  role: AccessRole;
};

type AccessContextValue = {
  user: AccessMe | null;
  loading: boolean;
  mail: boolean;
  empty: boolean;
  setupSql?: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error('useAccess');
  return value;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccessMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [mail, setMail] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [setupSql, setSetupSql] = useState<string>();

  const refresh = async () => {
    const response = await fetch('/api/access/me', { cache: 'no-store' });
    const data = await response.json().catch(() => ({})) as {
      user?: AccessMe | null;
      mail?: boolean;
      empty?: boolean;
      setupSql?: string;
    };
    setUser(data.user || null);
    setMail(Boolean(data.mail));
    setEmpty(Boolean(data.empty));
    setSetupSql(data.setupSql);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch('/api/access/logout', { method: 'POST' });
    setUser(null);
  };

  const value = useMemo<AccessContextValue>(() => ({
    user, loading, mail, empty, setupSql, refresh, logout,
  }), [user, loading, mail, empty, setupSql]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function AccessGate({ children }: { children: ReactNode }) {
  const access = useAccess();
  if (access.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Entrando…</p>
      </div>
    );
  }
  if (!access.user) return <AccessLogin />;
  return <>{children}</>;
}

export function AccessUserBar() {
  const access = useAccess();
  if (!access.user) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium leading-tight text-[var(--text-primary)]">{access.user.name}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{ACCESS_ROLE_LABEL[access.user.role]}</p>
      </div>
      <button
        type="button"
        onClick={() => void access.logout()}
        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
      >
        Salir
      </button>
    </div>
  );
}

function AccessLogin() {
  const access = useAccess();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requestCode = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; mailed?: boolean };
      if (!response.ok) {
        setError(data.error || 'No se ha podido enviar.');
        return;
      }
      setSent(true);
      if (data.mailed === false) setError(data.error || 'Pide el código a Operaciones.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(data.error || 'No se ha podido entrar.');
        return;
      }
      await access.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">TS Operaciones</p>
      <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight">Entra con tu correo</h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        Te mandamos un código. Solo entra quien esté en la lista.
      </p>
      {access.empty ? (
        <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Todavía no hay gente. Si eres Operaciones, pon el PIN en el código para dar de alta el primero.
        </p>
      ) : null}
      <form
        className="mt-8 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (access.empty || sent || code) void verify();
          else void requestCode();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@sportsemotion.com"
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
            autoComplete="email"
          />
        </label>
        {sent || access.empty ? (
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Código</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={access.empty ? 'PIN o código' : '000000'}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm tracking-[0.24em] outline-none"
            />
          </label>
        ) : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {sent || access.empty ? (
            <>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 items-center rounded-full bg-[var(--text-primary)] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Entrando…' : 'Entrar'}
              </button>
              {!access.empty ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void requestCode()}
                  className="h-11 rounded-full px-3 text-sm font-semibold text-[var(--text-secondary)]"
                >
                  Reenviar
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center rounded-full bg-[var(--text-primary)] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Enviando…' : 'Enviar código'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
