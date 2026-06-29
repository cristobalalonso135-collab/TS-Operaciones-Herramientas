'use client';

import { useState } from 'react';
import {
  NegativosConfig,
  NegativosZona,
  calcularNegativoZona,
  normalizeText,
} from '@/lib/budget-processor';
import { ChevronDown, ChevronUp, Download, Minus, Upload } from 'lucide-react';

interface NegativosFormProps {
  selectedMonth: string;
  config: NegativosConfig;
  onChange: (month: string, config: NegativosConfig) => void;
  onApply: () => void;
}

function formatCurrency(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function parseImportedNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;

  const withoutSymbols = String(value).trim().replace(/[%€]/g, '').replace(/\s/g, '');
  const hasComma = withoutSymbols.includes(',');
  const hasDot = withoutSymbols.includes('.');
  const normalized = hasComma && hasDot
    ? withoutSymbols.replace(/\./g, '').replace(',', '.')
    : withoutSymbols.replace(',', '.');

  return Number(normalized) || 0;
}

function parseImportedPercent(value: unknown): number {
  const number = parseImportedNumber(value);
  if (number !== 0 && Math.abs(number) <= 1) return number * 100;
  return number;
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeText);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeText(header)));
}

function monthMatches(uploadedMonth: unknown, selectedMonth: string): boolean {
  if (uploadedMonth === null || uploadedMonth === undefined || uploadedMonth === '') return true;

  const uploaded = normalizeText(String(uploadedMonth)).replace(/\s+/g, ' ');
  const selected = normalizeText(selectedMonth).replace(/\s+/g, ' ');
  const selectedParts = selected.split(' ').filter(Boolean);
  const selectedNumber = selectedParts[0] || '';
  const selectedName = selectedParts[selectedParts.length - 1] || selected;

  return uploaded === selected || uploaded.includes(selectedName) || uploaded === selectedNumber;
}

function normalizeRows(rows: unknown[][]): { headerIndex: number; headers: string[] } {
  for (let index = 0; index < rows.length; index += 1) {
    const headers = rows[index].map((cell) => String(cell ?? '').trim());
    const hasZona = findColumn(headers, ['zona']) >= 0;
    const hasNegativeValue = findColumn(headers, [
      'web b2c anterior',
      'web b2c',
      '% gen web',
      'grassroots',
      '% frees',
      '% free',
    ]) >= 0;

    if (hasZona && hasNegativeValue) return { headerIndex: index, headers };
  }

  return { headerIndex: -1, headers: [] };
}

export default function NegativosForm({ selectedMonth, config, onChange, onApply }: NegativosFormProps) {
  const [expanded, setExpanded] = useState(true);
  const [importStatus, setImportStatus] = useState<string | null>(null);

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
  const uploadId = `negativos-upload-${normalizeText(selectedMonth).replace(/\s+/g, '-')}`;

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const rows = config.zonas.map((zona) => ({
      Mes: selectedMonth,
      Zona: zona.zona,
      'Web B2C anterior': 0,
      '% Gen Web': 0,
      Grassroots: 0,
      '% Frees': 0,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Negativos');
    XLSX.writeFile(workbook, `plantilla_negativos_${selectedMonth.replace(/[^\w]+/g, '_')}.xlsx`);
  };

  const handleImportFile = async (file: File) => {
    setImportStatus('Leyendo archivo...');

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const { headerIndex, headers } = normalizeRows(rows);

      if (headerIndex < 0) {
        setImportStatus('No encuentro las columnas Zona y negativos en el archivo.');
        return;
      }

      const columns = {
        month: findColumn(headers, ['mes', 'mes fiscal', '# mes', 'periodo']),
        zona: findColumn(headers, ['zona']),
        webB2C: findColumn(headers, ['web b2c anterior', 'web b2c', 'web_b2c_anterior', 'gen web base']),
        pctGenWeb: findColumn(headers, ['% gen web', 'pct gen web', 'pct_gen_web', '% genweb']),
        grassroots: findColumn(headers, ['grassroots']),
        pctFrees: findColumn(headers, ['% frees', '% free', 'pct frees', 'pct_frees']),
      };

      const byZone = new Map(config.zonas.map((zona, index) => [normalizeText(zona.zona), index]));
      const newZonas = config.zonas.map((zona) => ({ ...zona }));
      let updated = 0;
      let added = 0;
      let skippedByMonth = 0;

      rows.slice(headerIndex + 1).forEach((row) => {
        if (columns.zona < 0) return;
        const zonaName = String(row[columns.zona] ?? '').trim();
        if (!zonaName) return;
        if (columns.month >= 0 && !monthMatches(row[columns.month], selectedMonth)) {
          skippedByMonth += 1;
          return;
        }

        const normalizedZone = normalizeText(zonaName);
        const existingIndex = byZone.get(normalizedZone);
        const base: NegativosZona = existingIndex !== undefined
          ? { ...newZonas[existingIndex] }
          : {
              zona: zonaName,
              web_b2c_anterior: 0,
              pct_gen_web: 0,
              grassroots: 0,
              pct_frees: 0,
            };

        const next: NegativosZona = {
          ...base,
          web_b2c_anterior: columns.webB2C >= 0 ? parseImportedNumber(row[columns.webB2C]) : base.web_b2c_anterior,
          pct_gen_web: columns.pctGenWeb >= 0 ? parseImportedPercent(row[columns.pctGenWeb]) : base.pct_gen_web,
          grassroots: columns.grassroots >= 0 ? parseImportedNumber(row[columns.grassroots]) : base.grassroots,
          pct_frees: columns.pctFrees >= 0 ? parseImportedPercent(row[columns.pctFrees]) : base.pct_frees,
        };

        if (existingIndex !== undefined) {
          newZonas[existingIndex] = next;
          updated += 1;
        } else {
          byZone.set(normalizedZone, newZonas.length);
          newZonas.push(next);
          added += 1;
        }
      });

      onChange(selectedMonth, { ...config, zonas: newZonas });
      const skippedText = skippedByMonth > 0 ? ` (${skippedByMonth} filas eran de otro mes)` : '';
      setImportStatus(`${updated} zonas actualizadas y ${added} nuevas${skippedText}. Puedes editar antes de aplicar.`);
    } catch (error) {
      setImportStatus('No he podido leer el archivo de negativos.');
      console.error(error);
    }
  };

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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-3">
            <div>
              <p className="text-xs font-medium text-[var(--text-primary)]">Carga de negativos</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Formato: Mes opcional, Zona, Web B2C anterior, % Gen Web, Grassroots y % Frees.
              </p>
              {importStatus && <p className="mt-1 text-xs text-[var(--text-secondary)]">{importStatus}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium transition hover:bg-[var(--bg-soft)]"
              >
                <Download className="h-4 w-4" />
                Descargar plantilla
              </button>
              <label
                htmlFor={uploadId}
                className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-medium text-white transition hover:opacity-90"
              >
                <Upload className="h-4 w-4" />
                Cargar Excel
              </label>
              <input
                id={uploadId}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleImportFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </div>
          </div>

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
              className="flex items-center gap-2 rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
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
