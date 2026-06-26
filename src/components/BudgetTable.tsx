'use client';

import { useMemo, useState } from 'react';
import { BudgetLineDaily } from '@/lib/budget-processor';
import { getHolidayName } from '@/lib/holidays';
import { Download } from 'lucide-react';

interface BudgetTableProps {
  data: BudgetLineDaily[];
  year: number;
  month: number;
  mesFiscal: string;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function formatCurrency(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDateHeader(dateValue: string): string {
  const date = new Date(dateValue);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function getNoBudgetReason(dateValue: string): string {
  const holidayName = getHolidayName(dateValue);
  if (holidayName) return `Sin budget: festivo Zaragoza - ${holidayName}`;

  const date = new Date(dateValue);
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return 'Sin budget: fin de semana';

  return 'Sin budget: dia no laborable';
}

function formatZonaForMatch(zona: string): string {
  const cleanZona = String(zona || '').trim();
  if (!cleanZona) return '\u00a0';
  return cleanZona.toLowerCase().startsWith('zona ') ? cleanZona : `Zona ${cleanZona}`;
}

function getExportIndexKey(line: BudgetLineDaily): string {
  return [
    line.id_vertical || line.vertical,
    line.medio_venta,
    formatZonaForMatch(line.zona),
    line.cod_mercado || line.pais,
  ].join('|');
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-0 rounded-md border border-[var(--border)] bg-white pl-3 pr-10 text-xs outline-none transition focus:border-[var(--accent)]"
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export default function BudgetTable({ data, mesFiscal }: BudgetTableProps) {
  if (data.length === 0) return null;

  const [filters, setFilters] = useState({
    vertical: '',
    medio: '',
    pais: '',
    zona: '',
  });

  const filterOptions = useMemo(() => ({
    vertical: Array.from(new Set(data.map((line) => line.vertical).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    medio: Array.from(new Set(data.map((line) => line.medio_venta).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    pais: Array.from(new Set(data.map((line) => line.pais).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    zona: Array.from(new Set(data.map((line) => line.zona).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
  }), [data]);

  const filteredData = useMemo(() => data.filter((line) => (
    (!filters.vertical || line.vertical === filters.vertical) &&
    (!filters.medio || line.medio_venta === filters.medio) &&
    (!filters.pais || line.pais === filters.pais) &&
    (!filters.zona || line.zona === filters.zona)
  )), [data, filters]);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ vertical: '', medio: '', pais: '', zona: '' });
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const days = data[0].dias;
  const totalMensual = filteredData.reduce((sum, l) => sum + l.importe, 0);
  const totalMargen = filteredData.reduce((sum, l) => sum + l.margen_bruto, 0);
  const totalCheck = filteredData.reduce((sum, l) => sum + l.total_check, 0);
  const isAllFy = mesFiscal === 'Todo FY';

  const buildSheetData = (kind: 'facturacion' | 'cogs') => {
    const rowsByKey = new Map<string, {
      idVertical: string;
      nombre: string;
      zona: string;
      codMercado: string;
      valuesByDate: Map<string, number>;
    }>();

    filteredData.forEach((line) => {
      const isCogs = kind === 'cogs';
      const key = getExportIndexKey(line);
      const existing = rowsByKey.get(key);
      const row = existing || {
        idVertical: line.id_vertical || line.vertical,
        nombre: line.medio_venta,
        zona: formatZonaForMatch(line.zona),
        codMercado: line.cod_mercado || line.pais,
        valuesByDate: new Map<string, number>(),
      };

      line.dias.forEach((day) => {
        const value = isCogs ? day.importe - day.margen : day.importe;
        row.valuesByDate.set(day.fecha, (row.valuesByDate.get(day.fecha) || 0) + value);
      });

      if (!existing) rowsByKey.set(key, row);
    });

    return [
      ['id_vertical', 'nombre', 'zona_equipaciones', 'cod_mercado', ...days.map((day) => formatDateHeader(day.fecha))],
      ...Array.from(rowsByKey.values()).map((row) => [
        row.idVertical,
        row.nombre,
        row.zona,
        row.codMercado,
        ...days.map((day) => row.valuesByDate.get(day.fecha) || null),
      ]),
    ];
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildSheetData('facturacion')), 'Hoja1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildSheetData('cogs')), 'COGS');
    XLSX.writeFile(wb, `budget_${mesFiscal.replace(/\s/g, '_')}.xlsx`);
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-8 flex-wrap">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Lineas</p>
            <p className="mt-1 text-sm font-semibold">{filteredData.length}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Laborables</p>
            <p className="mt-1 text-sm font-semibold">{data[0].dias_laborables}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">{isAllFy ? 'Total FY' : 'Total mensual'}</p>
            <p className="mt-1 text-sm font-semibold">{formatCurrency(totalMensual)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Margen bruto</p>
            <p className={`mt-1 text-sm font-semibold ${totalMargen >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {formatCurrency(totalMargen)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Check</p>
            <p className={`mt-1 text-sm font-semibold ${Math.abs(totalMensual - totalCheck) < 0.01 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {Math.abs(totalMensual - totalCheck) < 0.01 ? 'OK' : formatCurrency(totalCheck)}
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium transition hover:bg-[var(--bg-soft)]"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar {isAllFy ? 'vista' : 'mes'}
        </button>
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(160px,0.9fr)_minmax(220px,1.2fr)_160px]">
        <FilterSelect
          label="Vertical"
          value={filters.vertical}
          options={filterOptions.vertical}
          onChange={(value) => updateFilter('vertical', value)}
        />
        <FilterSelect
          label="Medio"
          value={filters.medio}
          options={filterOptions.medio}
          onChange={(value) => updateFilter('medio', value)}
        />
        <FilterSelect
          label="Pais"
          value={filters.pais}
          options={filterOptions.pais}
          onChange={(value) => updateFilter('pais', value)}
        />
        <FilterSelect
          label="Zona"
          value={filters.zona}
          options={filterOptions.zona}
          onChange={(value) => updateFilter('zona', value)}
        />
        <div className="flex items-end">
          <button
            onClick={clearFilters}
            disabled={!hasFilters}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]" style={{ maxHeight: '68vh' }}>
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
              <th className="sticky left-0 z-30 min-w-[150px] border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-3 text-left font-medium">Vertical</th>
              <th className="min-w-[130px] border-b border-[var(--border)] px-3 py-3 text-left font-medium">Medio</th>
              <th className="min-w-[80px] border-b border-[var(--border)] px-3 py-3 text-left font-medium">Pais</th>
              <th className="min-w-[130px] border-b border-[var(--border)] px-3 py-3 text-left font-medium">Zona</th>
              <th className="min-w-[120px] border-b border-[var(--border)] px-3 py-3 text-right font-medium">{isAllFy ? 'FY' : 'Mensual'}</th>
              <th className="min-w-[120px] border-b border-[var(--border)] px-3 py-3 text-right font-medium">Diario</th>
              {days.map((d) => {
                const date = new Date(d.fecha);
                const dow = date.getUTCDay();
                const noBudgetReason = !d.is_working ? getNoBudgetReason(d.fecha) : undefined;
                return (
                  <th
                    key={d.fecha}
                    title={noBudgetReason}
                    className={`min-w-[112px] border-b border-[var(--border)] px-3 py-3 text-right font-medium ${
                      !d.is_working ? 'bg-amber-100 text-amber-900' : ''
                    }`}
                  >
                    <div className="text-[10px]">{DAY_NAMES[dow]}</div>
                    <div>{formatDateHeader(d.fecha)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((line, i) => (
              <tr key={i} className="hover:bg-[var(--bg-primary)]">
                <td className="sticky left-0 z-10 max-w-[180px] truncate border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 font-medium" title={line.vertical}>
                  {line.vertical}
                </td>
                <td className="max-w-[160px] truncate border-b border-[var(--border)] px-3 py-2.5 text-[var(--text-secondary)]" title={line.medio_venta}>
                  {line.medio_venta}
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--text-secondary)]">
                  {line.pais?.slice(0, 3).toUpperCase()}
                </td>
                <td className="max-w-[160px] truncate border-b border-[var(--border)] px-3 py-2.5 text-[var(--text-secondary)]" title={line.zona}>
                  {line.zona}
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2.5 text-right font-mono tabular-nums">
                  {formatCurrency(line.importe)}
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2.5 text-right font-mono tabular-nums text-[var(--accent)]">
                  {formatCurrency(line.importe_diario)}
                </td>
                {line.dias.map((d) => {
                  const noBudgetReason = !d.is_working ? getNoBudgetReason(d.fecha) : undefined;
                  return (
                    <td
                      key={d.fecha}
                      title={noBudgetReason}
                      className={`border-b border-[var(--border)] px-3 py-2.5 text-right font-mono tabular-nums ${
                        !d.is_working ? 'bg-amber-50 text-amber-900' : ''
                      }`}
                    >
                      {d.importe !== 0 ? (
                        <span className={d.importe < 0 ? 'text-[var(--danger)]' : ''}>
                          {formatCurrency(d.importe)}
                        </span>
                      ) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-[var(--bg-soft)] font-semibold">
              <td className="sticky left-0 z-30 border-t border-[var(--border-strong)] bg-[var(--bg-soft)] px-3 py-3">TOTAL</td>
              <td className="border-t border-[var(--border-strong)]"></td>
              <td className="border-t border-[var(--border-strong)]"></td>
              <td className="border-t border-[var(--border-strong)]"></td>
              <td className="border-t border-[var(--border-strong)] px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(totalMensual)}</td>
              <td className="border-t border-[var(--border-strong)] px-3 py-3 text-right font-mono tabular-nums text-[var(--accent)]">
                {formatCurrency(totalMensual / data[0].dias_laborables)}
              </td>
              {days.map((d, di) => {
                const dayTotal = filteredData.reduce((sum, l) => sum + l.dias[di].importe, 0);
                const noBudgetReason = !d.is_working ? getNoBudgetReason(d.fecha) : undefined;
                return (
                  <td
                    key={d.fecha}
                    title={noBudgetReason}
                    className={`border-t border-[var(--border-strong)] px-3 py-3 text-right font-mono tabular-nums ${
                      !d.is_working ? 'bg-amber-100 text-amber-900' : ''
                    }`}
                  >
                    {dayTotal !== 0 ? (
                      <span className={dayTotal < 0 ? 'text-[var(--danger)]' : ''}>
                        {formatCurrency(dayTotal)}
                      </span>
                    ) : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
