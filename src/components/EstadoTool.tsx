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
  type EstadoMovimiento,
  type EstadoState,
  type MovimientoLado,
} from '@/lib/estado-model';
import { loadEstadoState, saveEstadoState, type EstadoBackend } from '@/lib/estado-store';

interface EstadoToolProps {
  onBack: () => void;
}

function ConceptoField({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="block w-full truncate rounded-sm text-left text-sm font-medium hover:bg-[var(--bg-soft)]"
      >
        {value || 'Sin concepto'}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== value) onSave(next);
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5 text-sm font-medium outline-none"
    />
  );
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
    const typed = importeText.trim();
    if (!typed || typed === '0' || typed === '-0' || typed === '-') {
      setError(null);
      return;
    }
    const parsed = parseEuro(typed);
    if (parsed === null || parsed === 0) {
      setError('Ese importe no se entiende.');
      return;
    }
    const importe = lado === 'gasto' ? Math.abs(parsed) : parsed;
    const etiqueta = concepto.trim() || tipologia.trim() || (lado === 'ingreso' ? 'Ingreso' : 'Gasto');
    setError(null);
    setConcepto('');
    setImporteText('');
    patchCaso(caso, {
      ...caso,
      movimientos: [...caso.movimientos, emptyMovimiento(lado, tipologia, etiqueta, importe)],
    });
  };

  const actualizarMovimiento = (movimientoId: string, patch: Partial<EstadoMovimiento>) => {
    const actual = state.casos.find((item) => item.id === casoId);
    if (!actual) return;
    patchCaso(actual, {
      ...actual,
      movimientos: actual.movimientos.map((item) => (item.id === movimientoId ? { ...item, ...patch } : item)),
    });
  };

  const borrarMovimiento = (movimientoId: string) => {
    const actual = state.casos.find((item) => item.id === casoId);
    if (!actual) return;
    patchCaso(actual, {
      ...actual,
      movimientos: actual.movimientos.filter((item) => item.id !== movimientoId),
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">10 Cuentas</p>
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
          </div>
        </section>

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
              onChange={(event) => {
                setError(null);
                setImporteText(event.target.value);
              }}
              inputMode="decimal"
              placeholder="150 o -40"
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
                        <ConceptoField
                          value={item.concepto}
                          onSave={(next) => actualizarMovimiento(item.id, { concepto: next })}
                        />
                        {item.tipologia && item.tipologia !== item.concepto && (
                          <p className="text-[11px] text-[var(--text-muted)]">{item.tipologia}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`text-sm font-semibold tabular-nums ${item.importe < 0 ? 'text-[var(--danger)]' : ''}`}>{formatEuro(item.importe)}</span>
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
                        <ConceptoField
                          value={item.concepto}
                          onSave={(next) => actualizarMovimiento(item.id, { concepto: next })}
                        />
                        {item.tipologia && item.tipologia !== item.concepto && (
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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">10 Cuentas</p>
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
