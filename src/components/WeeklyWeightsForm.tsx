'use client';

import {
  MonthData,
  WeeklyWeightConfig,
  getWeeklySummary,
  getWeeksForMonthData,
} from '@/lib/budget-processor';
import { BarChart3 } from 'lucide-react';

interface WeeklyWeightsFormProps {
  monthData: MonthData;
  config: WeeklyWeightConfig;
  onChange: (month: string, config: WeeklyWeightConfig) => void;
  onApply: () => void;
}

function formatCurrency(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(dateValue: string): string {
  const date = new Date(dateValue);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export default function WeeklyWeightsForm({ monthData, config, onChange, onApply }: WeeklyWeightsFormProps) {
  const weeks = getWeeksForMonthData(monthData);
  const summary = getWeeklySummary(monthData, config);
  const totalWeight = weeks.reduce((sum, week) => sum + (config.weights[week.id] || 0), 0);
  const isValid = Math.abs(totalWeight - 100) < 0.01;

  const updateWeight = (weekId: string, value: number) => {
    onChange(monthData.mes_fiscal, {
      weights: {
        ...config.weights,
        [weekId]: value,
      },
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Ponderacion semanal - {monthData.mes_fiscal}</p>
            <p className="text-xs text-[var(--text-secondary)]">Medios: Equipaciones y Equipaciones Web B2C</p>
          </div>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-mono ${isValid ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
          Total {totalWeight.toFixed(2)}%
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {weeks.map((week) => (
            <label key={week.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{week.label}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {formatDate(week.dates[0])} - {formatDate(week.dates[week.dates.length - 1])}
                  </p>
                </div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={config.weights[week.id] ?? 0}
                  onChange={(event) => updateWeight(week.id, parseFloat(event.target.value) || 0)}
                  className="w-24 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-right font-mono text-sm"
                />
              </div>
            </label>
          ))}
        </div>

        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Semana</th>
                <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Facturacion actual</th>
                <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Facturacion objetivo</th>
                <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((week) => (
                <tr key={week.weekId}>
                  <td className="border-b border-[var(--border)] px-3 py-2 font-medium">{week.label}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(week.current)}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(week.proposed)}</td>
                  <td className={`border-b border-[var(--border)] px-3 py-2 text-right font-mono ${week.proposed - week.current < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {formatCurrency(week.proposed - week.current)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onApply}
            disabled={!isValid}
            className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            Aplicar ponderacion semanal
          </button>
        </div>
      </div>
    </div>
  );
}
