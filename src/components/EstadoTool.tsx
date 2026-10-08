'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  casoTotales,
  emptyCaso,
  emptyEstadoState,
  emptyMovimiento,
  formatEuro,
  parseEuro,
  tipologiasUsadas,
  type EstadoCaso,
  type EstadoState,
  type MovimientoLado,
} from '@/lib/estado-model';
import { loadEstadoState, saveEstadoState, type EstadoBackend } from '@/lib/estado-store';

interface EstadoToolProps {
  onBack: () => void;
}

export default function EstadoTool({ onBack }: EstadoToolProps) {
  const [state, setState] = useState<EstadoState>(emptyEstadoState);
  const [backend, setBackend] = useState<EstadoBackend>('local');
  const [casoId, setCasoId] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [lado, setLado] = useState<MovimientoLado>('ingreso');
  const [tipologia, setTipologia] = useState('Cupón');
  const [concepto, setConcepto] = useState('');
  const [importeText, setImporteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (next: EstadoState) => {
    setState(next);
    try {
      await saveEstadoState(next, backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar. Queda en este navegador.');
    }
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    loadEstadoState()
      .then((result) => {
        if (cancelled) return;
        setState(result.state);
        setBackend(result.backend);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar el estado.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const caso = state.casos.find((item) => item.id === casoId) || null;
  const tipos = useMemo(() => tipologiasUsadas(state), [state]);

  const crearCaso = () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      setError('Ponle un nombre al caso.');
      return;
    }
    const created = emptyCaso(nombre);
    setError(null);
    setNuevoNombre('');
    setCasoId(created.id);
    void persist({ casos: [created, ...state.casos] });
  };

  const patchCaso = (casoActual: EstadoCaso, next: EstadoCaso) => {
    void persist({
      casos: state.casos.map((item) => (item.id === casoActual.id ? next : item)),
    });
  };

  const borrarCaso = (id: string) => {
    setCasoId(null);
    void persist({ casos: state.casos.filter((item) => item.id !== id) });
  };

  const addMovimiento = () => {
    if (!caso) return;
    const importe = parseEuro(importeText);
    if (importe === null || importe === 0) {
      setError('Pon un importe.');
      return;
    }
    const etiqueta = concepto.trim() || tipologia.trim() || (lado === 'ingreso' ? 'Ingreso' : 'Gasto');
    setError(null);
    setConcepto('');
    setImporteText('');
    patchCaso(caso, {
      ...caso,
      movimientos: [...caso.movimientos, emptyMovimiento(lado, tipologia, etiqueta, Math.abs(importe))],
    });
  };

  const borrarMovimiento = (movimientoId: string) => {
    if (!caso) return;
    patchCaso(caso, {
      ...caso,
      movimientos: caso.movimientos.filter((item) => item.id !== movimientoId),
    });
  };

  if (caso) {
    const totales = casoTotales(caso);
    const ingresos = caso.movimientos.filter((item) => item.lado === 'ingreso');
    const gastos = caso.movimientos.filter((item) => item.lado === 'gasto');
    const cuadra = caso.movimientos.length > 0 && Math.abs(totales.beneficio) < 0.005;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCasoId(null)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Casos
          </button>
          <button
            type="button"
            onClick={() => borrarCaso(caso.id)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar caso
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">10 Estado</p>
          <input
            value={caso.nombre}
            onChange={(event) => patchCaso(caso, { ...caso, nombre: event.target.value })}
            className="mt-1 w-full bg-transparent font-display text-2xl font-semibold tracking-tight outline-none"
          />
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ingresos</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight">{formatEuro(totales.ingresos)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Gastos</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight">{formatEuro(totales.gastos)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Beneficio</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight">{formatEuro(totales.beneficio)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {cuadra ? 'Ingresos y gastos se compensan.' : 'Lo que te entra: ingresos menos gastos.'}
            </p>
          </div>
        </section>

        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          El club te paga 150 € de cupón y no hay gasto: beneficio 150 €. El pack al padre y los 50 € del club no entran aquí.
          Si luego hay coste de material, o un padre paga en web en vez de usar el cupón y hay que liquidar, lo añades y el beneficio cambia.
        </p>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <form
          className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 sm:grid-cols-[auto_8rem_1fr_8rem_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            addMovimiento();
          }}
        >
          <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-1">
            <button
              type="button"
              onClick={() => setLado('ingreso')}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                lado === 'ingreso' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)]'
              }`}
            >
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => setLado('gasto')}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                lado === 'gasto' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)]'
              }`}
            >
              Gasto
            </button>
          </div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Tipología
            <input
              list="estado-tipos"
              value={tipologia}
              onChange={(event) => setTipologia(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm font-medium text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Qué es
            <input
              value={concepto}
              onChange={(event) => setConcepto(event.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm font-medium text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Importe
            <input
              value={importeText}
              onChange={(event) => setImporteText(event.target.value)}
              inputMode="decimal"
              placeholder="150"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm font-medium text-[var(--text-primary)]"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Añadir
          </button>
          <datalist id="estado-tipos">
            {tipos.map((tipo) => (
              <option key={tipo} value={tipo} />
            ))}
          </datalist>
        </form>

        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="grid sm:grid-cols-2">
            <div className="border-b border-[var(--border)] p-4 sm:border-b-0 sm:border-r">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ingresos</p>
              {ingresos.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--text-muted)]">Todavía no hay ingresos.</p>
              ) : (
                <ul className="mt-2">
                  {ingresos.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 border-t border-[var(--border)] py-2.5 first:border-t-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.concepto}</p>
                        {item.tipologia && (
                          <p className="text-[11px] text-[var(--text-muted)]">{item.tipologia}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">{formatEuro(item.importe)}</span>
                        <button type="button" onClick={() => borrarMovimiento(item.id)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Quitar movimiento">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-between border-t-2 border-[var(--text-primary)] pt-3 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatEuro(totales.ingresos)}</span>
              </div>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Gastos</p>
              {gastos.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--text-muted)]">Todavía no hay gastos.</p>
              ) : (
                <ul className="mt-2">
                  {gastos.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 border-t border-[var(--border)] py-2.5 first:border-t-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.concepto}</p>
                        {item.tipologia && (
                          <p className="text-[11px] text-[var(--text-muted)]">{item.tipologia}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">{formatEuro(item.importe)}</span>
                        <button type="button" onClick={() => borrarMovimiento(item.id)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Quitar movimiento">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-between border-t-2 border-[var(--text-primary)] pt-3 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatEuro(totales.gastos)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Beneficio {formatEuro(totales.beneficio)}
            </p>
            {cuadra && (
              <span className="rounded-md bg-[var(--success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
                Cuadra
              </span>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Herramientas
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">10 Estado</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Ingresos, gastos, beneficio</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Lo que quieres ver es el beneficio: ingresos menos gastos. Un cupón de 150 € sin coste son 150 € de beneficio. Luego añades el coste, un cobro de más o la liquidación.
        </p>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <form
        className="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          crearCaso();
        }}
      >
        <input
          value={nuevoNombre}
          onChange={(event) => setNuevoNombre(event.target.value)}
          placeholder="Nombre del caso"
          className="min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Nuevo caso
        </button>
      </form>

      {state.casos.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Todavía no hay casos.</p>
      ) : (
        <section className="grid gap-2">
          {state.casos.map((item) => {
            const totales = casoTotales(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCasoId(item.id)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left hover:border-[var(--border-strong)]"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold tracking-tight">{item.nombre || 'Sin nombre'}</p>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    Beneficio {formatEuro(totales.beneficio)} · {item.movimientos.length === 1 ? '1 movimiento' : `${item.movimientos.length} movimientos`}
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-semibold tabular-nums">{formatEuro(totales.beneficio)}</p>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
