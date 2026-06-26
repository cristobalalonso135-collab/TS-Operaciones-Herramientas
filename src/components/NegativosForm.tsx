'use client';

import { useState } from 'react';
import {
  NegativosConfig,
  NegativosZona,
  calcularNegativoZona,
} from '@/lib/budget-processor';
import { ChevronDown, ChevronUp, Minus } from 'lucide-react';

interface NegativosFormProps {
  selectedMonth: string;
  config: NegativosConfig;
  onChange: (month: string, config: NegativosConfig) => void;
  onApply: () => void;
}

function formatCurrency(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function NegativosForm({ selectedMonth, config, onChange, onApply }: NegativosFormProps) {
  const [expanded, setExpanded] = useState(true);

  const updateZona = (idx: number, field: keyof NegativosZona, value: number) => {
    const newZonas = [...config.zonas];
    newZonas[idx] = { ...newZonas[idx], [field]: value };
    onChange(selectedMonth, { ...config, zonas: newZonas });
  };

  const updatePonderacion = (idx: number, value: number) => {
    const newPond = [...config.ponderacion];
    newPond[idx] = value;
    onChange(selectedMonth, { ...config, ponderacion: newPond });
  };

  const totalNegativo = config.zonas.reduce((s, z) => s + calcularNegativoZona(z).total, 0);
  const sumPonderacion = config.ponderacion.reduce((s, v) => s + v, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 transition hover:bg-[var(--bg-soft)]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--danger-soft)] text-[var(--danger)]">
            <Minus className="h-4 w-4" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Negativos - {selectedMonth}</p>
            <p className="text-xs text-[var(--text-secondary)]">Total: <span className="font-mono text-[var(--danger)]">{formatCurrency(totalNegativo)}</span></p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-[var(--text-secondary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-[var(--border)] p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Ponderacion dias</span>
            {config.ponderacion.map((p, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-xs text-[var(--text-secondary)]">Dia {i + 1}</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={p}
                  onChange={(e) => updatePonderacion(i, parseFloat(e.target.value) || 0)}
                  className="w-16 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-center font-mono text-xs"
                />
                <span className="text-xs text-[var(--text-muted)]">({(p * 100).toFixed(0)}%)</span>
              </div>
            ))}
            <span className={`rounded-md px-2 py-1 text-xs font-mono ${Math.abs(sumPonderacion - 1) < 0.001 ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
              Total {(sumPonderacion * 100).toFixed(0)}%
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium">Zona</th>
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium">Web B2C anterior</th>
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium">% Gen Web</th>
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium">Gen Web</th>
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium">Grassroots</th>
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium">% Frees</th>
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium">Frees</th>
                  <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium text-[var(--danger)]">Total negativo</th>
                </tr>
              </thead>
              <tbody>
                {config.zonas.map((z, i) => {
                  const calc = calcularNegativoZona(z);
                  return (
                    <tr key={z.zona} className="hover:bg-[var(--bg-primary)]">
                      <td className="border-b border-[var(--border)] px-3 py-2 font-medium whitespace-nowrap">{z.zona}</td>
                      <td className="border-b border-[var(--border)] px-2 py-1.5">
                        <input
                          type="number"
                          value={z.web_b2c_anterior || ''}
                          onChange={(e) => updateZona(i, 'web_b2c_anterior', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full min-w-[120px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-right font-mono text-xs"
                        />
                      </td>
                      <td className="border-b border-[var(--border)] px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={z.pct_gen_web || ''}
                          onChange={(e) => updateZona(i, 'pct_gen_web', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-20 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-right font-mono text-xs"
                        />
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono text-[var(--text-secondary)]">{formatCurrency(calc.gen_web)}</td>
                      <td className="border-b border-[var(--border)] px-2 py-1.5">
                        <input
                          type="number"
                          value={z.grassroots || ''}
                          onChange={(e) => updateZona(i, 'grassroots', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full min-w-[120px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-right font-mono text-xs"
                        />
                      </td>
                      <td className="border-b border-[var(--border)] px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={z.pct_frees || ''}
                          onChange={(e) => updateZona(i, 'pct_frees', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-20 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-right font-mono text-xs"
                        />
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono text-[var(--text-secondary)]">{formatCurrency(calc.frees)}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono font-semibold text-[var(--danger)]">{formatCurrency(calc.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onApply}
              disabled={totalNegativo === 0}
              className="flex items-center gap-2 rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Minus className="h-4 w-4" />
              Aplicar negativos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
