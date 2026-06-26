'use client';

import { BudgetLineDaily } from '@/lib/budget-processor';
import { Download } from 'lucide-react';

interface BudgetTableProps {
  data: BudgetLineDaily[];
  year: number;
  month: number;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatNum(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BudgetTable({ data, year, month }: BudgetTableProps) {
  if (data.length === 0) return null;

  const days = data[0].dias;
  const totalMensual = data.reduce((sum, l) => sum + l.importe_mensual, 0);
  const totalCheck = data.reduce((sum, l) => sum + l.total_check, 0);

  const handleExport = async () => {
    const XLSX = (await import('xlsx')).default;
    const wsData: any[][] = [];

    // Header
    const header = ['Índice', 'ID Vertical', 'Nombre', 'Zona', 'Mercado', 'Mensual', 'Diario', 'Días Lab.'];
    days.forEach((d) => header.push(d.fecha));
    header.push('Total Check');
    wsData.push(header);

    // Data rows
    data.forEach((line) => {
      const row: any[] = [
        line.indice, line.id_vertical, line.nombre,
        line.zona_equipaciones, line.cod_mercado,
        line.importe_mensual, line.importe_diario, line.dias_laborables,
      ];
      line.dias.forEach((d) => row.push(d.importe));
      row.push(line.total_check);
      wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Step0_Diario');
    XLSX.writeFile(wb, `budget_step0_${year}_${String(month).padStart(2, '0')}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Período</p>
            <p className="text-sm font-medium">{MONTH_NAMES[month - 1]} {year}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Líneas</p>
            <p className="text-sm font-medium">{data.length}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Días laborables</p>
            <p className="text-sm font-medium">{data[0].dias_laborables}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Total mensual</p>
            <p className="text-sm font-medium">{formatNum(totalMensual)} &euro;</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Total check</p>
            <p className={`text-sm font-medium ${Math.abs(totalMensual - totalCheck) < 0.01 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {formatNum(totalCheck)} &euro;
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded transition-colors"
        >
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--bg-card)]">
              <th className="sticky left-0 z-10 bg-[var(--bg-card)] px-3 py-2 text-left font-medium whitespace-nowrap">Nombre</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Zona</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Mercado</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Mensual</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Diario</th>
              {days.map((d) => {
                const date = new Date(d.fecha);
                const dayNum = date.getDate();
                const dow = date.getDay();
                return (
                  <th
                    key={d.fecha}
                    className={`px-2 py-2 text-right font-medium whitespace-nowrap ${
                      !d.is_working ? 'text-[var(--text-secondary)]/40 bg-[var(--bg-secondary)]' : ''
                    }`}
                    title={`${DAY_NAMES[dow]} ${dayNum}`}
                  >
                    <div className="text-[10px] text-[var(--text-secondary)]">{DAY_NAMES[dow]}</div>
                    <div>{dayNum}</div>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((line, i) => (
              <tr
                key={line.indice || i}
                className="border-t border-[var(--border)] hover:bg-[var(--bg-card)]/50"
              >
                <td className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1.5 whitespace-nowrap font-medium">
                  {line.nombre}
                </td>
                <td className="px-3 py-1.5 text-[var(--text-secondary)] whitespace-nowrap">
                  {line.zona_equipaciones || '—'}
                </td>
                <td className="px-3 py-1.5 text-[var(--text-secondary)] whitespace-nowrap">
                  {line.cod_mercado}
                </td>
                <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">
                  {formatNum(line.importe_mensual)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap text-[var(--accent)]">
                  {formatNum(line.importe_diario)}
                </td>
                {line.dias.map((d) => (
                  <td
                    key={d.fecha}
                    className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${
                      !d.is_working ? 'text-[var(--text-secondary)]/30 bg-[var(--bg-secondary)]' : ''
                    }`}
                  >
                    {d.importe > 0 ? formatNum(d.importe) : '—'}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap font-medium">
                  {formatNum(line.total_check)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-card)] font-medium">
              <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-3 py-2">TOTAL</td>
              <td></td>
              <td></td>
              <td className="px-3 py-2 text-right font-mono">{formatNum(totalMensual)}</td>
              <td className="px-3 py-2 text-right font-mono text-[var(--accent)]">
                {formatNum(totalMensual / data[0].dias_laborables)}
              </td>
              {days.map((d, di) => {
                const dayTotal = data.reduce((sum, l) => sum + l.dias[di].importe, 0);
                return (
                  <td
                    key={d.fecha}
                    className={`px-2 py-2 text-right font-mono ${
                      !d.is_working ? 'text-[var(--text-secondary)]/30 bg-[var(--bg-secondary)]' : ''
                    }`}
                  >
                    {dayTotal > 0 ? formatNum(dayTotal) : '—'}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-mono">{formatNum(totalCheck)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
