'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  ACCESS_ROLE_HINT,
  ACCESS_ROLE_LABEL,
  ACCESS_ROLES,
  type AccessRole,
  type AccessUser,
} from '@/lib/access-model';

export default function UsersTool({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [setupSql, setSetupSql] = useState<string>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccessRole>('comercial');
  const [status, setStatus] = useState('');
  const [issued, setIssued] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch('/api/access/users', { cache: 'no-store' });
    const data = await response.json().catch(() => ({})) as { users?: AccessUser[]; setupSql?: string; error?: string };
    if (!response.ok) {
      setStatus(data.error || 'No se ha podido cargar la gente.');
      return;
    }
    setUsers(data.users || []);
    setSetupSql(data.setupSql);
  };

  useEffect(() => { void load(); }, []);

  const persist = async (next: AccessUser[]) => {
    setBusy(true);
    try {
      const response = await fetch('/api/access/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: next }),
      });
      const data = await response.json().catch(() => ({})) as { users?: AccessUser[]; error?: string };
      if (!response.ok) {
        setStatus(data.error || 'No se ha podido guardar.');
        return false;
      }
      setUsers(data.users || next);
      setStatus('Guardado.');
      return true;
    } finally {
      setBusy(false);
    }
  };

  const addUser = async () => {
    const nextEmail = email.trim().toLocaleLowerCase('es');
    if (!nextEmail.includes('@')) {
      setStatus('Pon un correo.');
      return;
    }
    if (users.some((item) => item.email === nextEmail)) {
      setStatus('Ese correo ya está.');
      return;
    }
    const created: AccessUser = {
      id: nextEmail,
      email: nextEmail,
      name: name.trim() || nextEmail.split('@')[0],
      role,
      active: true,
      createdAt: new Date().toISOString(),
    };
    if (await persist([created, ...users])) {
      setName('');
      setEmail('');
      setRole('comercial');
    }
  };

  const issue = async (target: string) => {
    setBusy(true);
    setIssued('');
    try {
      const response = await fetch('/api/access/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const data = await response.json().catch(() => ({})) as { mailed?: boolean; code?: string; error?: string };
      if (!response.ok) {
        setStatus(data.error || 'No se ha podido mandar.');
        return;
      }
      if (data.mailed) setStatus(`Código enviado a ${target}.`);
      else {
        setStatus(data.error || 'Pásale el código tú.');
        setIssued(data.code || '');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Herramientas
      </button>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Acceso</p>
        <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight">Gente</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Tú eliges el rol. Ellos entran con un código al correo. Si el correo no está configurado en Vercel, te enseño el código y se lo pasas tú.
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nueva persona</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.2fr_10rem_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre"
            className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="correo@sportsemotion.com"
            className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as AccessRole)}
            className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          >
            {ACCESS_ROLES.map((item) => (
              <option key={item} value={item}>{ACCESS_ROLE_LABEL[item]}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addUser()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Añadir
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {ACCESS_ROLES.map((item) => `${ACCESS_ROLE_LABEL[item]}: ${ACCESS_ROLE_HINT[item]}`).join(' · ')}
        </p>
      </section>

      {status ? <p className="text-sm text-[var(--text-secondary)]">{status}</p> : null}
      {issued ? (
        <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 font-mono text-2xl tracking-[0.28em] text-[var(--text-primary)]">
          {issued}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        {users.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[var(--text-muted)]">Aún no hay nadie. Añade el primer correo.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.map((item) => (
                <tr key={item.email}>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{item.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={item.role}
                      onChange={(event) => void persist(users.map((row) => (
                        row.email === item.email ? { ...row, role: event.target.value as AccessRole } : row
                      )))}
                      className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-sm outline-none"
                    >
                      {ACCESS_ROLES.map((option) => (
                        <option key={option} value={option}>{ACCESS_ROLE_LABEL[option]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void persist(users.map((row) => (
                        row.email === item.email ? { ...row, active: !row.active } : row
                      )))}
                      className={`text-xs font-semibold ${item.active ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}
                    >
                      {item.active ? 'Sí' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy || !item.active}
                        onClick={() => void issue(item.email)}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                      >
                        Mandar código
                      </button>
                      <button
                        type="button"
                        onClick={() => void persist(users.filter((row) => row.email !== item.email))}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)]"
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {setupSql ? (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-amber-800">
            Hay que crear la tabla en Supabase para que la lista se vea en toda la red. Pégalo en SQL Editor:
          </p>
          <pre className="overflow-auto rounded-xl bg-neutral-950 px-4 py-3 text-[11px] text-neutral-100">{setupSql}</pre>
        </div>
      ) : null}
    </div>
  );
}
