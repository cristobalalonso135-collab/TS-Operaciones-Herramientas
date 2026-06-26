'use client';

import { BudgetLineDaily } from '@/lib/budget-processor';
import { Download } from 'lucide-react';

interface BudgetTableProps {
  data: BudgetLineDaily[];
  year: number;
  month: number;
  mesFiscal: string;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function formatCurrency(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatShortCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M€`;
  if (abs >= 1000) return `${(n / 1000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} K€`;
  return formatCurrency(n);
}

export default function BudgetTable({ data, mesFiscal }: BudgetTableProps) {
  if (data.length === 0) return null;

  const days = data[0].dias;
  const totalMensual = data.reduce((sum, l) => sum + l.importe, 0);
  const totalMargen = data.reduce((sum, l) => sum + l.margen_bruto, 0);
  const totalCheck = data.reduce((sum, l) => sum + l.total_check, 0);
  const isAllFy = mesFiscal === 'Todo FY';

  const buildSheetData = (kind: 'facturacion' | 'cogs') => {
    const wsData: any[][] = [];
    const header = ['Area', 'Vertical', 'Medio Venta', 'Pais', 'Zona', 'Mensual', 'Margen', '% Margen', 'Diario', 'Dias Lab.'];
    days.forEach((d) => header.push(d.fecha));
    header.push('Total Check');
    wsData.push(header);

    data.forEach((line) => {
      const isCogs = kind === 'cogs';
      const mensual = isCogs ? line.importe - line.margen_bruto : line.importe;
      const diario = line.dias_laborables > 0 ? mensual / line.dias_laborables : 0;
      const dailyValues = line.dias.map((d) => (isCogs ? d.importe - d.margen : d.importe));
      const totalDaily = dailyValues.reduce((sum, value) => sum + value, 0);
      const row: any[] = [
        line.area,
        line.vertical,
        line.medio_venta,
        line.pais,
        line.zona,
        mensual,
        line.margen_bruto,
        line.pct_margen,
        diario,
        line.dias_laborables,
      ];

      dailyValues.forEach((value) => row.push(value));
      row.push(totalDaily);
      wsData.push(row);
    });

    return wsData;
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildSheetData('facturacion')), 'Facturacion');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildSheetData('cogs')), 'COGS');
    XLSX.writeFile(wb, `budget_${mesFiscal.replace(/\s/g, '_')}.xlsx`);
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-8 flex-wrap">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Lineas</p>
            <p className="mt-1 text-sm font-semibold">{data.length}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Laborables</p>
            <p className="mt-1 text-sm font-semibold">{data[0].dias_laborables}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Total mensual</p>
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

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]" style={{ maxHeight: '68vh' }}>
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
              <th className="sticky left-0 z-30 min-w-[150px] border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-3 text-left font-medium">Vertical</th>
              <th className="min-w-[130px] border-b border-[var(--border)] px-3 py-3 text-left font-medium">Medio</th>
              <th className="min-w-[80px] border-b border-[var(--border)] px-3 py-3 text-left font-medium">Pais</th>
              <th className="min-w-[130px] border-b border-[var(--border)] px-3 py-3 text-left font-medium">Zona</th>
              <th className="min-w-[120px] border-b border-[var(--border)] px-3 py-3 text-right font-medium">Mensual</th>
              <th className="min-w-[120px] border-b border-[var(--border)] px-3 py-3 text-right font-medium">Diario</th>
              {days.map((d) => {
                const date = new Date(d.fecha);
                const dayNum = date.getUTCDate();
                const dow = date.getUTCDay();
                const monthNum = date.getUTCMonth() + 1;
                return (
                  <th
                    key={d.fecha}
                    className={`min-w-[112px] border-b border-[var(--border)] px-3 py-3 text-right font-medium ${
                      !d.is_working ? 'bg-[var(--bg-primary)] text-[var(--text-muted)]' : ''
                    }`}
                  >
                    <div className="text-[10px]">{DAY_NAMES[dow]}</div>
                    <div>{isAllFy ? `${dayNum}/${monthNum}` : dayNum}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((line, i) => (
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
                {line.dias.map((d) => (
                  <td
                    key={d.fecha}
                    className={`border-b border-[var(--border)] px-3 py-2.5 text-right font-mono tabular-nums ${
                      !d.is_working ? 'bg-[var(--bg-primary)] text-[var(--text-muted)]' : ''
                    }`}
                  >
                    {d.importe !== 0 ? (
                      <span className={d.importe < 0 ? 'text-[var(--danger)]' : ''}>
                        {formatCurrency(d.importe)}
                      </span>
                    ) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-[var(--bg-soft)] font-semibold">
              <td className="sticky left-0 z-30 border-t border-[var(--border-strong)] bg-[var(--bg-soft)] px-3 py-3">TOTAL</td>
              <td className="border-t border-[var(--border-strong)]"></td>
              <td className="border-t border-[var(--border-strong)]"></td>
              <td className="border-t border-[var(--border-strong)]"></td>
              <td className="border-t border-[var(--border-strong)] px-3 py-3 text-right font-mono tabular-nums">{formatShortCurrency(totalMensual)}</td>
              <td className="border-t border-[var(--border-strong)] px-3 py-3 text-right font-mono tabular-nums text-[var(--accent)]">
                {formatShortCurrency(totalMensual / data[0].dias_laborables)}
              </td>
              {days.map((d, di) => {
                const dayTotal = data.reduce((sum, l) => sum + l.dias[di].importe, 0);
                return (
                  <td
                    key={d.fecha}
                    className={`border-t border-[var(--border-strong)] px-3 py-3 text-right font-mono tabular-nums ${
                      !d.is_working ? 'bg-[var(--bg-primary)] text-[var(--text-muted)]' : ''
                    }`}
                  >
                    {dayTotal !== 0 ? (
                      <span className={dayTotal < 0 ? 'text-[var(--danger)]' : ''}>
                        {formatShortCurrency(dayTotal)}
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
