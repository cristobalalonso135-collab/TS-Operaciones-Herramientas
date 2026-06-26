'use client';

import { useState } from 'react';
import {
  NegativosConfig,
  NegativosZona,
  calcularNegativoZona,
  defaultNegativosConfig,
  FISCAL_MONTHS_ORDER,
} from '@/lib/budget-processor';
import { Minus, Plus, X } from 'lucide-react';

interface NegativosFormProps {
  selectedMonth: string;
  config: NegativosConfig;
  onChange: (month: string, config: NegativosConfig) => void;
  onApply: () => void;
}

function formatNum(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] hover:bg-[var(--border)]/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Minus className="w-4 h-4 text-[var(--danger)]" />
          <span className="text-sm font-medium">Negativos — {selectedMonth}</span>
          <span className="text-xs text-[var(--text-secondary)]">
            Total: <span className="text-[var(--danger)] font-mono">{formatNum(totalNegativo)} €</span>
          </span>
        </div>
        <span className="text-xs text-[var(--text-secondary)]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Ponderación */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs text-[var(--text-secondary)] font-medium">Ponderación días:</span>
            {config.ponderacion.map((p, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-[10px] text-[var(--text-secondary)]">Día {i + 1}:</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={p}
                  onChange={(e) => updatePonderacion(i, parseFloat(e.target.value) || 0)}
                  className="w-16 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-center"
                />
                <span className="text-[10px] text-[var(--text-secondary)]">({(p * 100).toFixed(0)}%)</span>
              </div>
            ))}
            <span className={`text-[10px] font-mono ${Math.abs(sumPonderacion - 1) < 0.001 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              Σ = {(sumPonderacion * 100).toFixed(0)}%
            </span>
          </div>

          {/* Tabla de zonas */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--bg-secondary)]">
                  <th className="px-3 py-2 text-left font-medium">Zona</th>
                  <th className="px-3 py-2 text-right font-medium">Web B2C Anterior</th>
                  <th className="px-3 py-2 text-right font-medium">% Gen Web</th>
                  <th className="px-3 py-2 text-right font-medium">Gen Web</th>
                  <th className="px-3 py-2 text-right font-medium">Grassroots</th>
                  <th className="px-3 py-2 text-right font-medium">% Frees</th>
                  <th className="px-3 py-2 text-right font-medium">Frees</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--danger)]">Total Negativo</th>
                </tr>
              </thead>
              <tbody>
                {config.zonas.map((z, i) => {
                  const calc = calcularNegativoZona(z);
                  return (
                    <tr key={z.zona} className="border-t border-[var(--border)]/50">
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{z.zona}</td>
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          value={z.web_b2c_anterior || ''}
                          onChange={(e) => updateZona(i, 'web_b2c_anterior', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-right"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={z.pct_gen_web || ''}
                          onChange={(e) => updateZona(i, 'pct_gen_web', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-20 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-right"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                        {formatNum(calc.gen_web)}
                      </td>
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          value={z.grassroots || ''}
                          onChange={(e) => updateZona(i, 'grassroots', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-right"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={z.pct_frees || ''}
                          onChange={(e) => updateZona(i, 'pct_frees', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-20 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-right"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                        {formatNum(calc.frees)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-medium text-[var(--danger)]">
                        {formatNum(calc.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-card)] font-medium">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatNum(config.zonas.reduce((s, z) => s + z.web_b2c_anterior, 0))}
                  </td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatNum(config.zonas.reduce((s, z) => s + calcularNegativoZona(z).gen_web, 0))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatNum(config.zonas.reduce((s, z) => s + z.grassroots, 0))}
                  </td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatNum(config.zonas.reduce((s, z) => s + calcularNegativoZona(z).frees, 0))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--danger)]">
                    {formatNum(totalNegativo)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Botón aplicar */}
          <div className="flex justify-end">
            <button
              onClick={onApply}
              disabled={totalNegativo === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--danger)] hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
            >
              <Minus className="w-4 h-4" />
              Aplicar Negativos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
