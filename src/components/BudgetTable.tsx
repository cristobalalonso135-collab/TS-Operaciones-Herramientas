'use client';

import { BudgetLineDaily } from '@/lib/budget-processor';
import { Download } from 'lucide-react';

interface BudgetTableProps {
  data: BudgetLineDaily[];
  year: number;
  month: number;
  mesFiscal: string;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatNum(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toFixed(0);
}

export default function BudgetTable({ data, year, month, mesFiscal }: BudgetTableProps) {
  if (data.length === 0) return null;

  const days = data[0].dias;
  const totalMensual = data.reduce((sum, l) => sum + l.importe, 0);
  const totalMargen = data.reduce((sum, l) => sum + l.margen_bruto, 0);
  const totalCheck = data.reduce((sum, l) => sum + l.total_check, 0);

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const wsData: any[][] = [];

    const header = ['Área', 'Vertical', 'Medio Venta', 'País', 'Zona', 'Mensual', 'Margen', '% Margen', 'Diario', 'Días Lab.'];
    days.forEach((d) => header.push(d.fecha));
    header.push('Total Check');
    wsData.push(header);

    data.forEach((line) => {
      const row: any[] = [
        line.area, line.vertical, line.medio_venta, line.pais, line.zona,
        line.importe, line.margen_bruto, line.pct_margen,
        line.importe_diario, line.dias_laborables,
      ];
      line.dias.forEach((d) => row.push(d.importe));
      row.push(line.total_check);
      wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Step0');
    XLSX.writeFile(wb, `step0_${mesFiscal.replace(/\s/g, '_')}.xlsx`);
  };

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-6 flex-wrap">
          <div>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Líneas</p>
            <p className="text-sm font-medium">{data.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Laborables</p>
            <p className="text-sm font-medium">{data[0].dias_laborables}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Total mensual</p>
            <p className="text-sm font-medium">{formatNum(totalMensual)} &euro;</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Margen bruto</p>
            <p className={`text-sm font-medium ${totalMargen >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {formatNum(totalMargen)} &euro;
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Check ✓</p>
            <p className={`text-sm font-medium ${Math.abs(totalMensual - totalCheck) < 0.01 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {Math.abs(totalMensual - totalCheck) < 0.01 ? 'OK' : formatNum(totalCheck)}
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded transition-colors"
        >
          <Download className="w-3 h-3" />
          Exportar
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]" style={{ maxHeight: '70vh' }}>
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[var(--bg-card)]">
              <th className="sticky left-0 z-30 bg-[var(--bg-card)] px-2 py-2 text-left font-medium">Vertical</th>
              <th className="px-2 py-2 text-left font-medium">Medio</th>
              <th className="px-2 py-2 text-left font-medium">País</th>
              <th className="px-2 py-2 text-right font-medium">Mensual</th>
              <th className="px-2 py-2 text-right font-medium">Diario</th>
              {days.map((d) => {
                const date = new Date(d.fecha);
                const dayNum = date.getUTCDate();
                const dow = date.getUTCDay();
                return (
                  <th
                    key={d.fecha}
                    className={`px-1.5 py-2 text-right font-medium ${
                      !d.is_working ? 'text-[var(--text-secondary)]/40 bg-[var(--bg-secondary)]' : ''
                    }`}
                  >
                    <div className="text-[9px] text-[var(--text-secondary)]">{DAY_NAMES[dow]}</div>
                    <div>{dayNum}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((line, i) => (
              <tr
                key={i}
                className="border-t border-[var(--border)]/50 hover:bg-[var(--bg-card)]/30"
              >
                <td className="sticky left-0 z-10 bg-[var(--bg-primary)] px-2 py-1 whitespace-nowrap font-medium max-w-[140px] truncate" title={line.vertical}>
                  {line.vertical}
                </td>
                <td className="px-2 py-1 text-[var(--text-secondary)] whitespace-nowrap max-w-[120px] truncate" title={line.medio_venta}>
                  {line.medio_venta}
                </td>
                <td className="px-2 py-1 text-[var(--text-secondary)] whitespace-nowrap">
                  {line.pais?.slice(0, 3).toUpperCase()}
                </td>
                <td className="px-2 py-1 text-right font-mono whitespace-nowrap">
                  {formatCompact(line.importe)}
                </td>
                <td className="px-2 py-1 text-right font-mono whitespace-nowrap text-[var(--accent)]">
                  {formatCompact(line.importe_diario)}
                </td>
                {line.dias.map((d) => (
                  <td
                    key={d.fecha}
                    className={`px-1.5 py-1 text-right font-mono whitespace-nowrap ${
                      !d.is_working ? 'text-[var(--text-secondary)]/20 bg-[var(--bg-secondary)]' : ''
                    }`}
                  >
                    {d.importe !== 0 ? (
                      <span className={d.importe < 0 ? 'text-[var(--danger)]' : ''}>
                        {formatCompact(d.importe)}
                      </span>
                    ) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="border-t-2 border-[var(--accent)]/30 bg-[var(--bg-card)] font-medium">
              <td className="sticky left-0 z-30 bg-[var(--bg-card)] px-2 py-2">TOTAL</td>
              <td></td>
              <td></td>
              <td className="px-2 py-2 text-right font-mono">{formatCompact(totalMensual)}</td>
              <td className="px-2 py-2 text-right font-mono text-[var(--accent)]">
                {formatCompact(totalMensual / data[0].dias_laborables)}
              </td>
              {days.map((d, di) => {
                const dayTotal = data.reduce((sum, l) => sum + l.dias[di].importe, 0);
                return (
                  <td
                    key={d.fecha}
                    className={`px-1.5 py-2 text-right font-mono ${
                      !d.is_working ? 'text-[var(--text-secondary)]/20 bg-[var(--bg-secondary)]' : ''
                    }`}
                  >
                    {dayTotal !== 0 ? (
                      <span className={dayTotal < 0 ? 'text-[var(--danger)]' : ''}>
                        {formatCompact(dayTotal)}
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
