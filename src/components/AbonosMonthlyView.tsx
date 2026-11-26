'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMoney, todayIso, type AbonoComputed, type AbonoReceipt } from '@/lib/abonos-model';

export type MonthlyMetric = 'previsto' | 'cobrado' | 'pendiente';

const METRICS: Array<{ id: MonthlyMetric; label: string; hint: string }> = [
  { id: 'previsto', label: 'Previsto', hint: 'Importe previsto en el mes de su fecha prevista.' },
  { id: 'cobrado', label: 'Cobrado', hint: 'Lo que entró, en el mes en que se registró el cobro.' },
  { id: 'pendiente', label: 'Pendiente', hint: 'Lo que falta por cobrar, en el mes de su fecha prevista.' },
];

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const NO_DATE = 'none';
const BLANK_LABEL = '—';

/** Fiscal year starts on 1 April: FY26-27 runs from April 2026 to March 2027. */
export function fiscalYearOf(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return month >= 4 ? year : year - 1;
}

export function fiscalYearLabel(start: number): string {
  return `FY${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

function fiscalMonths(start: number): Array<{ key: string; label: string }> {
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((3 + index) % 12) + 1;
    const year = month >= 4 ? start : start + 1;
    return {
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${MONTH_LABELS[month - 1]}-${String(year).slice(-2)}`,
    };
  });
}

type Entry = { date: string | null; amount: number };

function entriesFor(row: AbonoComputed, metric: MonthlyMetric, receiptsByCase: Map<string, AbonoReceipt[]>): Entry[] {
  if (metric === 'previsto') return [{ date: row.dueDate, amount: row.expectedAmount ?? 0 }];
  if (metric === 'pendiente') return [{ date: row.dueDate, amount: row.pending }];
  const receipts = receiptsByCase.get(row.id) || [];
  const entries: Entry[] = receipts.map((item) => ({ date: item.receivedAt || row.dueDate, amount: item.amount }));
  // An abono marked Cobrado without receipts still counts, in the month of its due date.
  const recorded = receipts.reduce((sum, item) => sum + item.amount, 0);
  if (row.receivedTotal - recorded > 0.005) entries.push({ date: row.dueDate, amount: row.receivedTotal - recorded });
  return entries;
}

type Cells = Map<string, number>;

interface BrandLine {
  brand: string;
  months: Cells;
  years: Cells;
  total: number;
}

interface TypeGroup {
  type: string;
  brands: BrandLine[];
  months: Cells;
  years: Cells;
  total: number;
}

function add(cells: Cells, key: string, amount: number) {
  cells.set(key, (cells.get(key) || 0) + amount);
}

function Amount({ value, tone }: { value: number | undefined; tone?: 'danger' | 'success' }) {
  if (!value || Math.abs(value) < 0.005) return <span className="text-[#d4d4d8]">·</span>;
  const color = tone === 'danger' ? 'text-[var(--danger)]' : tone === 'success' ? 'text-[var(--success)]' : '';
  return <span className={color}>{formatMoney(value).replace(',00 €', ' €')}</span>;
}

export default function AbonosMonthlyView({
  rows,
  receipts,
  onOpenCell,
}: {
  rows: AbonoComputed[];
  receipts: AbonoReceipt[];
  onOpenCell: (cell: { brand: string; type: string; month: string | null }) => void;
}) {
  const today = todayIso();
  const [metric, setMetric] = useState<MonthlyMetric>('previsto');
  const [fy, setFy] = useState<number>(fiscalYearOf(today));
  const currentMonth = today.slice(0, 7);

  const receiptsByCase = useMemo(() => {
    const map = new Map<string, AbonoReceipt[]>();
    receipts.forEach((item) => map.set(item.caseId, [...(map.get(item.caseId) || []), item]));
    return map;
  }, [receipts]);

  const { groups, years, totals, hasNoDate } = useMemo(() => {
    const byType = new Map<string, Map<string, BrandLine>>();
    const yearSet = new Set<number>([fy]);
    let noDate = false;
    rows.forEach((row) => {
      entriesFor(row, metric, receiptsByCase).forEach(({ date, amount }) => {
        if (Math.abs(amount) < 0.005) return;
        const type = row.type || BLANK_LABEL;
        const brand = row.brand || BLANK_LABEL;
        const brands = byType.get(type) || new Map<string, BrandLine>();
        byType.set(type, brands);
        const line = brands.get(brand) || { brand, months: new Map(), years: new Map(), total: 0 };
        brands.set(brand, line);
        if (!date) {
          noDate = true;
          add(line.months, NO_DATE, amount);
          return;
        }
        const year = fiscalYearOf(date);
        yearSet.add(year);
        add(line.years, String(year), amount);
        if (year === fy) {
          add(line.months, date.slice(0, 7), amount);
          line.total += amount;
        }
      });
    });
    const groupList: TypeGroup[] = Array.from(byType.entries()).map(([type, brands]) => {
      const lines = Array.from(brands.values())
        .filter((line) => line.total > 0.005 || line.months.has(NO_DATE) || Array.from(line.years.values()).some((value) => value > 0.005))
        .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand, 'es'));
      const months: Cells = new Map();
      const yearCells: Cells = new Map();
      lines.forEach((line) => {
        line.months.forEach((value, key) => add(months, key, value));
        line.years.forEach((value, key) => add(yearCells, key, value));
      });
      return { type, brands: lines, months, years: yearCells, total: lines.reduce((sum, line) => sum + line.total, 0) };
    }).sort((a, b) => b.total - a.total || a.type.localeCompare(b.type, 'es'));
    const all: { months: Cells; years: Cells; total: number } = { months: new Map(), years: new Map(), total: 0 };
    groupList.forEach((group) => {
      group.months.forEach((value, key) => add(all.months, key, value));
      group.years.forEach((value, key) => add(all.years, key, value));
      all.total += group.total;
    });
    return { groups: groupList, years: Array.from(yearSet).sort((a, b) => a - b), totals: all, hasNoDate: noDate };
  }, [rows, metric, receiptsByCase, fy]);

  const months = fiscalMonths(fy);
  const overdueTone = (key: string) => (metric === 'pendiente' && key < currentMonth ? 'danger' : metric === 'cobrado' ? 'success' : undefined);
  const metricInfo = METRICS.find((item) => item.id === metric)!;

  return (
    <div className="abonos-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFy(fy - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--bg-soft)]"
            aria-label="Año fiscal anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[88px] text-center font-display text-lg font-semibold tracking-tight">{fiscalYearLabel(fy)}</span>
          <button
            type="button"
            onClick={() => setFy(fy + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--bg-soft)]"
            aria-label="Año fiscal siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 hidden text-xs text-[var(--text-muted)] md:inline">{metricInfo.hint}</span>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] p-1">
          {METRICS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMetric(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${metric === item.id ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--text-secondary)]">No hay importes para estos filtros.</p>
      ) : (
        <div className="overflow-auto">
          <table className="abonos-monthly w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[200px] text-left">Tipo / Marca</th>
                {months.map((month) => (
                  <th key={month.key} className={month.key === currentMonth ? 'is-current' : ''}>{month.label}</th>
                ))}
                {hasNoDate && <th>Sin fecha</th>}
                <th className="is-total">Total {fiscalYearLabel(fy)}</th>
                {years.map((year) => (
                  <th key={year} className={`is-year ${year === fy ? 'is-selected' : ''}`}>{fiscalYearLabel(year)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.type}>
                  <tr className="is-group">
                    <td className="sticky left-0 z-10 text-left">{group.type}</td>
                    {months.map((month) => <td key={month.key}><Amount value={group.months.get(month.key)} /></td>)}
                    {hasNoDate && <td><Amount value={group.months.get(NO_DATE)} /></td>}
                    <td className="is-total"><Amount value={group.total} /></td>
                    {years.map((year) => <td key={year} className="is-year"><Amount value={group.years.get(String(year))} /></td>)}
                  </tr>
                  {group.brands.map((line) => (
                    <tr key={`${group.type}-${line.brand}`}>
                      <td className="sticky left-0 z-10 pl-6 text-left text-[var(--text-secondary)]">{line.brand}</td>
                      {months.map((month) => {
                        const value = line.months.get(month.key);
                        return (
                          <td key={month.key}>
                            {value ? (
                              <button type="button" onClick={() => onOpenCell({ brand: line.brand, type: group.type, month: month.key })} className="hover:underline">
                                <Amount value={value} tone={overdueTone(month.key)} />
                              </button>
                            ) : <Amount value={value} />}
                          </td>
                        );
                      })}
                      {hasNoDate && (
                        <td>
                          {line.months.get(NO_DATE) ? (
                            <button type="button" onClick={() => onOpenCell({ brand: line.brand, type: group.type, month: null })} className="hover:underline">
                              <Amount value={line.months.get(NO_DATE)} />
                            </button>
                          ) : <Amount value={undefined} />}
                        </td>
                      )}
                      <td className="is-total"><Amount value={line.total} /></td>
                      {years.map((year) => <td key={year} className="is-year"><Amount value={line.years.get(String(year))} /></td>)}
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="is-grand">
                <td className="sticky left-0 z-10 text-left">Total</td>
                {months.map((month) => <td key={month.key}><Amount value={totals.months.get(month.key)} /></td>)}
                {hasNoDate && <td><Amount value={totals.months.get(NO_DATE)} /></td>}
                <td className="is-total"><Amount value={totals.total} /></td>
                {years.map((year) => <td key={year} className="is-year"><Amount value={totals.years.get(String(year))} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
