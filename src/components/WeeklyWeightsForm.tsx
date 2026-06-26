'use client';

import {
  MonthData,
  WEEKLY_TARGET_MEDIOS,
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

function formatPct(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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

  const updateGrowth = (medio: string, weekId: string, value: number) => {
    onChange(monthData.mes_fiscal, {
      mediaGrowth: {
        ...config.mediaGrowth,
        [medio]: {
          ...(config.mediaGrowth[medio] || {}),
          [weekId]: value,
        },
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
            <p className="text-xs text-[var(--text-secondary)]">Ajuste independiente por medio y crecimiento del budget diario</p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-4">
        {WEEKLY_TARGET_MEDIOS.map((medio) => {
          const summary = getWeeklySummary(monthData, config, medio);
          const totalTarget = summary.reduce((sum, week) => sum + week.targetBudget, 0);

          return (
            <section key={medio} className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{medio}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Budget total objetivo: {formatCurrency(totalTarget)}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {weeks.map((week, index) => (
                  <label key={week.id} className="rounded-md border border-[var(--border)] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{week.label}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {formatDate(week.dates[0])} - {formatDate(week.dates[week.dates.length - 1])}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-[var(--text-secondary)]">Crec. diario</span>
                        <input
                          type="number"
                          step="0.01"
                          value={index === 0 ? 0 : (config.mediaGrowth[medio]?.[week.id] ?? 0)}
                          disabled={index === 0}
                          onChange={(event) => updateGrowth(medio, week.id, parseFloat(event.target.value) || 0)}
                          className="w-24 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-right font-mono text-sm disabled:bg-[var(--bg-soft)] disabled:text-[var(--text-muted)]"
                        />
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                      <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Semana</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dias laborables</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Budget actual</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Promedio diario actual</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Crec. diario vs anterior</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Budget objetivo semana</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Promedio diario objetivo</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((week, index) => (
                      <tr key={week.weekId}>
                        <td className="border-b border-[var(--border)] px-3 py-2 font-medium">{week.label}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{week.workingDays}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(week.currentBudget)}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(week.currentDailyAverage)}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{index === 0 ? '-' : formatPct(week.growthPct)}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(week.targetBudget)}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(week.targetDailyAverage)}</td>
                        <td className={`border-b border-[var(--border)] px-3 py-2 text-right font-mono ${week.targetBudget - week.currentBudget < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                          {formatCurrency(week.targetBudget - week.currentBudget)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <div className="flex justify-end">
          <button
            onClick={onApply}
            className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
          >
            Aplicar ponderacion semanal
          </button>
        </div>
      </div>
    </div>
  );
}
