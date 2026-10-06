'use client';

import { useState } from 'react';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  BLANCA_ACTUAL,
  CRISTOBAL_ACTUAL,
  CRISTOBAL_ANTERIOR,
  OBJETIVO_KIND_LABEL,
  PERSONAS,
  type ObjetivoItem,
  type ObjetivoPack,
} from '@/lib/objetivos-data';

interface ObjetivosToolProps {
  onBack: () => void;
}

type PersonaId = (typeof PERSONAS)[number]['id'];

const TABS = PERSONAS.map((persona) => ({ id: persona.id, label: persona.nombre.split(' ')[0] }));

function formatPeso(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })}%`;
}

function GoalCard({ item }: { item: ObjetivoItem }) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {OBJETIVO_KIND_LABEL[item.kind]}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold tracking-tight">{item.titulo}</h3>
        </div>
        <span className="rounded-md bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
          {formatPeso(item.peso)}
        </span>
      </div>
      {item.cifra && (
        <p className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          {item.cifra}
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{item.medida}</p>
      {item.partes && (
        <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
          {item.partes.map((parte) => (
            <div key={parte.titulo} className="flex gap-3">
              <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold text-[var(--accent)]">
                {formatPeso(parte.peso)}
              </span>
              <div>
                <p className="text-sm font-semibold">{parte.titulo}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]">{parte.medida}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function PackView({ pack }: { pack: ObjetivoPack }) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {pack.etiqueta}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{pack.persona}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{pack.rol}</p>
          </div>
          {pack.vigente ? (
            <span className="rounded-md bg-[var(--success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
              Vigente
            </span>
          ) : (
            <span className="rounded-md bg-[var(--bg-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              Sustituido
            </span>
          )}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Responsable</dt>
            <dd className="mt-0.5 font-medium">{pack.responsableActual}</dd>
          </div>
          {pack.reunion && (
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">OTO</dt>
              <dd className="mt-0.5 font-medium">{pack.reunion} · {pack.liderArchivo}</dd>
            </div>
          )}
        </dl>
        <div className="mt-5 grid grid-cols-4 overflow-hidden rounded-lg border border-[var(--border)]">
          {pack.items.map((item) => (
            <div key={item.id} className="border-l border-[var(--border)] first:border-l-0 px-2 py-3 text-center sm:px-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] sm:text-[11px]">
                {item.corto}
              </p>
              <p className="mt-1 font-display text-lg font-semibold sm:text-xl">{formatPeso(item.peso)}</p>
            </div>
          ))}
        </div>
        {pack.nota && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">{pack.nota}</p>
        )}
      </section>

      <section className="grid gap-4">
        {pack.items.map((item) => (
          <GoalCard key={item.id} item={item} />
        ))}
      </section>

      {pack.escala && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="font-display text-base font-semibold">Escala EBITDA · sobre el 25% de compañía</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Consecución del 13,1 M€ post bonus. Así se paga ese 25%.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Consecución</th>
                  <th className="px-3 py-2 text-right font-medium">Pago del 25%</th>
                </tr>
              </thead>
              <tbody>
                {pack.escala.map((row) => (
                  <tr key={row.rango} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{row.rango}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{row.pago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function CambioRow({ label, antes, ahora }: { label: string; antes: string; ahora: string }) {
  return (
    <div className="grid gap-2 border-t border-[var(--border)] py-3 sm:grid-cols-[140px_1fr_1fr] sm:gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="text-sm text-[var(--text-secondary)]">{antes}</p>
      <p className="text-sm font-medium">{ahora}</p>
    </div>
  );
}

export default function ObjetivosTool({ onBack }: ObjetivosToolProps) {
  const [personaId, setPersonaId] = useState<PersonaId>('cristobal');
  const [cristobalPack, setCristobalPack] = useState<'actual' | 'anterior'>('actual');

  const pack: ObjetivoPack = personaId === 'blanca'
    ? BLANCA_ACTUAL
    : cristobalPack === 'actual'
      ? CRISTOBAL_ACTUAL
      : CRISTOBAL_ANTERIOR;

  return (
    <div className="space-y-5">
      <WorkspaceChrome
        onBack={onBack}
        tabs={TABS}
        active={personaId}
        onSelect={(id) => setPersonaId(id as PersonaId)}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">09 Objetivos</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Objetivos FY 26/27</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Los tuyos vigentes son los del Excel en español. Los de Target Setting son los antiguos.
            Blanca es tu equipo: los suyos actuales siguen el Target Setting.
          </p>
        </div>
        {personaId === 'cristobal' && (
          <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-1">
            <button
              type="button"
              onClick={() => setCristobalPack('actual')}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                cristobalPack === 'actual' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-white'
              }`}
            >
              Actuales
            </button>
            <button
              type="button"
              onClick={() => setCristobalPack('anterior')}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                cristobalPack === 'anterior' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-white'
              }`}
            >
              Anteriores
            </button>
          </div>
        )}
      </div>

      {personaId === 'cristobal' && cristobalPack === 'actual' && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
          <h3 className="text-sm font-semibold">Qué cambió respecto al Target Setting</h3>
          <div className="mt-2 hidden text-[11px] uppercase tracking-wide text-[var(--text-muted)] sm:grid sm:grid-cols-[140px_1fr_1fr] sm:gap-4">
            <span />
            <span>Antes</span>
            <span>Ahora</span>
          </div>
          <CambioRow label="Responsable" antes="Pablo Laguna" ahora="Alberto Antequera" />
          <CambioRow label="Compañía" antes="EBITDA SE 13,1 M€" ahora="EBITDA 13,1 M€ post bonus, con escala" />
          <CambioRow label="Departamento" antes="EBITDA Teamsport 8,725 M€ pre central (25%)" ahora="C Margin 8,8 M€ (25%) + stock &lt; 11 M€ Equi y B2B (25%)" />
          <CambioRow
            label="Individual"
            antes="IA generador de propuestas + estampaciones 3 M€ + marketing 88.000 €"
            ahora="IA/web (5%), Francia 15,6 M€ y 39,17% (10%), off marcas (5%), excesos estampación (5%)"
          />
        </section>
      )}

      <PackView pack={pack} />
    </div>
  );
}
