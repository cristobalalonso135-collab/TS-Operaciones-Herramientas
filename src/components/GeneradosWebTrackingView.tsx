'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { normalizeText } from '@/lib/business-classification';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet } from 'lucide-react';

export interface ZonaMonthSales {
  zona: string;
  monthIndex: number | null;
  facturacion: number;
}

interface GeneradosWebTrackingViewProps {
  zonaSales?: ZonaMonthSales[];
}

interface GenLine {
  monthIndex: number;
  monthLabel: string;
  fyStart: number;
  zona: string;
  gen: number;
  genCost: number;
  b2cPrev: number;
  pctB2c: number | null;
}

interface GenTotals {
  gen: number;
  genCost: number;
  b2cPrev: number;
  pctB2c: number | null;
}

type ZonaSortKey = 'zona' | 'genCost' | 'b2cPrev' | 'pctB2c' | 'pctLy' | 'pctZona' | 'extra';

const FISCAL_MONTHS = [
  { index: 1, label: '1 · Abril', names: ['abril', 'april', 'apr', 'abr'] },
  { index: 2, label: '2 · Mayo', names: ['mayo', 'may'] },
  { index: 3, label: '3 · Junio', names: ['junio', 'june', 'jun'] },
  { index: 4, label: '4 · Julio', names: ['julio', 'july', 'jul'] },
  { index: 5, label: '5 · Agosto', names: ['agosto', 'august', 'ago', 'aug'] },
  { index: 6, label: '6 · Septiembre', names: ['septiembre', 'setiembre', 'september', 'sept', 'sep', 'set'] },
  { index: 7, label: '7 · Octubre', names: ['octubre', 'october', 'oct'] },
  { index: 8, label: '8 · Noviembre', names: ['noviembre', 'november', 'nov'] },
  { index: 9, label: '9 · Diciembre', names: ['diciembre', 'december', 'dic', 'dec'] },
  { index: 10, label: '10 · Enero', names: ['enero', 'january', 'ene', 'jan'] },
  { index: 11, label: '11 · Febrero', names: ['febrero', 'february', 'feb'] },
  { index: 12, label: '12 · Marzo', names: ['marzo', 'march', 'mar'] },
] as const;

const ZONA_ORDER = ['Norte', 'Centro-Sur', 'Levante', 'Portugal', 'Francia', 'Italia Norte', 'Italia Centro-Sur', 'Sin zona'];

function cellPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).replace(/\u00a0/g, ' ').trim() !== '';
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!cellPresent(value)) return 0;
  const raw = String(value).replace(/€/g, '').replace(/%/g, '').replace(/\s/g, '').trim();
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  const normalized = hasComma && hasDot
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  return Number(normalized) || 0;
}

function fiscalMonthByIndex(index: number): { index: number; label: string } | null {
  const found = FISCAL_MONTHS.find((month) => month.index === index);
  return found ? { index: found.index, label: found.label } : null;
}

function parseFiscalMonth(value: unknown): { index: number; label: string } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fiscalMonthByIndex(((value.getMonth() + 9) % 12) + 1);
  }
  if (!cellPresent(value)) return null;
  const normalized = normalizeText(value).replace(/[._'`’]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = FISCAL_MONTHS
    .flatMap((month) => month.names.map((name) => ({ name, month })))
    .sort((a, b) => b.name.length - a.name.length);
  const named = aliases.find(({ name }) => (
    name.length <= 3
      ? new RegExp(`(?:^| )${name}(?: |$)`).test(normalized)
      : normalized.includes(name)
  ));
  if (named) return { index: named.month.index, label: named.month.label };
  return null;
}

function parseCalendarYear(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear();
  const text = String(value ?? '');
  const apostrophe = text.match(/'(\d{2})\b/);
  if (apostrophe) return 2000 + Number(apostrophe[1]);
  const full = text.match(/\b(20\d{2}|19\d{2})\b/);
  if (full) return Number(full[1]);
  return null;
}

function fyStartFrom(calendarYear: number, monthIndex: number): number {
  return monthIndex >= 10 ? calendarYear - 1 : calendarYear;
}

function fyLabel(start: number): string {
  return `${String(start).slice(-2)}/${String(start + 1).slice(-2)}`;
}

function emptyTotals(): GenTotals {
  return { gen: 0, genCost: 0, b2cPrev: 0, pctB2c: null };
}

function sumLines(lines: GenLine[]): GenTotals {
  const block = emptyTotals();
  lines.forEach((line) => {
    block.gen += line.gen;
    block.genCost += line.genCost;
    block.b2cPrev += line.b2cPrev;
  });
  block.pctB2c = block.b2cPrev === 0 ? null : (block.genCost / block.b2cPrev) * 100;
  return block;
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

function formatSignedCurrency(value: number): string {
  const formatted = formatCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function formatAbsPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function extraGen(ty: GenTotals, ly: GenTotals): number | null {
  if (ty.pctB2c === null || ly.pctB2c === null) return null;
  return ty.b2cPrev * ((ty.pctB2c - ly.pctB2c) / 100);
}

function paceLabel(extra: number | null): string {
  if (extra === null) return 'Sin dato';
  if (extra < -500) return 'Retrasada';
  if (extra > 500) return 'Adelantada';
  return 'En línea';
}

function freeTone(delta: number | null): string {
  if (delta === null) return 'text-[var(--text-muted)]';
  if (delta < -0.05) return 'text-[var(--danger)]';
  if (delta > 0.05) return 'text-[var(--warning)]';
  return 'text-[var(--success)]';
}

function findHeader(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => {
    const needle = normalizeText(alias);
    return header === needle || header.includes(needle);
  }));
}

function parseGeneradosData(rows: unknown[][]): GenLine[] {
  if (!rows.length) throw new Error('El archivo está vacío.');
  const headerIndex = rows.findIndex((row) => row.some((cell) => {
    const header = normalizeText(cell);
    return header.includes('gen') && header.includes('web');
  }));
  if (headerIndex < 0) {
    throw new Error('No reconozco el archivo. ¿Trae Año-Mes, Zona CRM, Gen. Web y Equipaciones Web B2C (Mes -1)?');
  }

  const headers = (rows[headerIndex] || []).map((cell) => normalizeText(cell));
  const colMap = {
    month: findHeader(headers, ['ano-mes', 'año-mes', 'year-month', 'mes']),
    zona: findHeader(headers, ['zona crm', 'zona']),
    gen: headers.findIndex((header) => (header === 'gen. web' || header === 'gen web' || header.startsWith('gen')) && !header.includes('%')),
    b2c: findHeader(headers, ['equipaciones web b2c', 'web b2c', 'mes -1']),
  };
  if (colMap.month < 0 || colMap.zona < 0 || colMap.gen < 0 || colMap.b2c < 0) {
    throw new Error('Faltan columnas: Año-Mes, Zona CRM, Gen. Web o Equipaciones Web B2C (Mes -1).');
  }

  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cellPresent(cell)))
    .map((row) => {
      const monthValue = row[colMap.month];
      const month = parseFiscalMonth(monthValue);
      const calendarYear = parseCalendarYear(monthValue);
      const zona = cellPresent(row[colMap.zona]) ? String(row[colMap.zona]).trim() : 'Sin zona';
      const gen = parseAmount(row[colMap.gen]);
      const b2cPrev = parseAmount(row[colMap.b2c]);
      if (!month || calendarYear === null) return null;
      const genCost = -gen;
      return {
        monthIndex: month.index,
        monthLabel: month.label,
        fyStart: fyStartFrom(calendarYear, month.index),
        zona,
        gen,
        genCost,
        b2cPrev,
        pctB2c: b2cPrev === 0 ? null : (genCost / b2cPrev) * 100,
      };
    })
    .filter((line): line is GenLine => line !== null && (line.gen !== 0 || line.b2cPrev !== 0));
}

function zonaKey(zona: string): string {
  return normalizeText(zona).replace(/^zona\s+/, '');
}

function lookupZonaSales(
  sales: ZonaMonthSales[],
  zona: string,
  monthIndex: number | null,
  ytdMonth: number,
): number {
  const key = zonaKey(zona);
  return sales.reduce((sum, row) => {
    if (zonaKey(row.zona) !== key) return sum;
    if (monthIndex === null) {
      if (row.monthIndex === null || row.monthIndex <= ytdMonth) return sum + row.facturacion;
      return sum;
    }
    if (row.monthIndex === monthIndex) return sum + row.facturacion;
    return sum;
  }, 0);
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${tone || 'text-[var(--text-primary)]'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}

export default function GeneradosWebTrackingView({ zonaSales = [] }: GeneradosWebTrackingViewProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<GenLine[]>([]);
  const [sort, setSort] = useState<{ key: ZonaSortKey; direction: 'asc' | 'desc' }>({ key: 'extra', direction: 'desc' });

  const handleFileLoaded = (data: unknown[][], name: string) => {
    try {
      const parsed = parseGeneradosData(data);
      if (parsed.length === 0) throw new Error('El archivo no tiene filas con generados o Web B2C.');
      setLines(parsed);
      setFileName(name);
      setError(null);
    } catch (err) {
      setLines([]);
      setFileName(null);
      setError(err instanceof Error ? err.message : 'No he podido leer el archivo.');
    }
  };

  const hasZonaSales = zonaSales.some((row) => row.facturacion !== 0);

  const analysis = useMemo(() => {
    if (lines.length === 0) return null;
    const fyStarts = Array.from(new Set(lines.map((line) => line.fyStart))).sort((a, b) => a - b);
    const currentFy = fyStarts[fyStarts.length - 1];
    const lastFy = fyStarts.find((year) => year === currentFy - 1) ?? fyStarts[fyStarts.length - 2] ?? null;
    const tyLines = lines.filter((line) => line.fyStart === currentFy);
    const lyLines = lastFy === null ? [] : lines.filter((line) => line.fyStart === lastFy);
    const ytdMonth = Math.max(...tyLines.map((line) => line.monthIndex));
    const tyYtd = sumLines(tyLines.filter((line) => line.monthIndex <= ytdMonth));
    const lyYtd = sumLines(lyLines.filter((line) => line.monthIndex <= ytdMonth));
    const lyFull = sumLines(lyLines);
    const extraEuros = extraGen(tyYtd, lyYtd);
    const zonaFactYtd = hasZonaSales
      ? Array.from(new Set(tyLines.map((line) => line.zona))).reduce((sum, zona) => (
        sum + lookupZonaSales(zonaSales, zona, null, ytdMonth)
      ), 0)
      : 0;
    const pctZona = zonaFactYtd > 0 ? (tyYtd.genCost / zonaFactYtd) * 100 : null;
    const monthly = FISCAL_MONTHS.map((month) => ({
      ...month,
      ty: sumLines(tyLines.filter((line) => line.monthIndex === month.index)),
      ly: sumLines(lyLines.filter((line) => line.monthIndex === month.index)),
    }));
    const zonas = Array.from(new Set(lines.map((line) => line.zona)));
    return {
      currentFy,
      lastFy,
      ytdMonth,
      ytdLabel: FISCAL_MONTHS.find((month) => month.index === ytdMonth)?.label ?? String(ytdMonth),
      tyYtd,
      lyYtd,
      lyFull,
      extraEuros,
      zonaFactYtd,
      pctZona,
      monthly,
      zonas,
    };
  }, [hasZonaSales, lines, zonaSales]);

  const zonaRows = useMemo(() => {
    if (!analysis) return [];
    return analysis.zonas.map((zona) => {
      const ty = sumLines(lines.filter((line) => line.fyStart === analysis.currentFy && line.zona === zona && line.monthIndex <= analysis.ytdMonth));
      const ly = analysis.lastFy === null
        ? emptyTotals()
        : sumLines(lines.filter((line) => line.fyStart === analysis.lastFy && line.zona === zona && line.monthIndex <= analysis.ytdMonth));
      const lyFull = analysis.lastFy === null
        ? emptyTotals()
        : sumLines(lines.filter((line) => line.fyStart === analysis.lastFy && line.zona === zona));
      const extra = extraGen(ty, ly);
      const zonaFact = hasZonaSales ? lookupZonaSales(zonaSales, zona, null, analysis.ytdMonth) : 0;
      const pctZona = zonaFact > 0 ? (ty.genCost / zonaFact) * 100 : null;
      const pending = ty.b2cPrev > 0 && ty.genCost === 0;
      return {
        zona,
        ty,
        ly,
        extra,
        pctCierreLy: lyFull.pctB2c,
        zonaFact,
        pctZona,
        pending,
        delta: ty.pctB2c !== null && ly.pctB2c !== null ? ty.pctB2c - ly.pctB2c : null,
      };
    }).sort((a, b) => {
      const orderA = ZONA_ORDER.indexOf(a.zona);
      const orderB = ZONA_ORDER.indexOf(b.zona);
      if (sort.key === 'zona') {
        const base = (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB) || a.zona.localeCompare(b.zona, 'es');
        return sort.direction === 'asc' ? base : -base;
      }
      const pick = (row: typeof a) => (
        sort.key === 'genCost' ? row.ty.genCost
          : sort.key === 'b2cPrev' ? row.ty.b2cPrev
            : sort.key === 'pctB2c' ? row.ty.pctB2c
              : sort.key === 'pctLy' ? row.pctCierreLy
                : sort.key === 'pctZona' ? row.pctZona
                  : row.extra
      );
      const left = pick(a);
      const right = pick(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const result = Number(left) - Number(right);
      return sort.direction === 'asc' ? result : -result;
    });
  }, [analysis, hasZonaSales, lines, sort, zonaSales]);

  const updateSort = (key: ZonaSortKey) => {
    setSort((prev) => (
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'zona' ? 'asc' : 'desc' }
    ));
  };

  const downloadZonas = () => {
    if (!analysis) return;
    const header = ['Zona', 'Gen. Web TY', 'Web B2C mes -1', '% vs B2C', '% cierre LY', 'Fact. zona TY', '% vs zona', 'Extra € vs LY'];
    const csv = [header, ...zonaRows.map((row) => [
      row.zona,
      row.ty.genCost,
      row.ty.b2cPrev,
      row.ty.pctB2c,
      row.pctCierreLy,
      row.zonaFact || '',
      row.pctZona,
      row.extra,
    ])].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'generados_web_zonas.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxPct = analysis
    ? Math.max(20, ...analysis.monthly.flatMap((month) => [month.ty.pctB2c ?? 0, month.ly.pctB2c ?? 0].map((value) => Math.min(Math.abs(value), 80))))
    : 20;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <FileUpload
          inputId="tracking-generados-input"
          label="CSV de generados web (Año-Mes, Zona CRM, Gen. Web, Equipaciones Web B2C Mes -1)"
          onFileLoaded={handleFileLoaded}
          keepDropzone
        />
        {fileName && analysis && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Cargado: {fileName} · FY {fyLabel(analysis.currentFy)} hasta {analysis.ytdLabel}
            {analysis.lastFy !== null ? ` · comparado con FY ${fyLabel(analysis.lastFy)}` : ''}
            {hasZonaSales ? ' · peso sobre zona con Teamsports' : ' · sube Teamsports en YTD para ver el peso sobre la zona'}
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {lines.length === 0 && !error && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Sube data3.csv. El % es Gen. Web / Equipaciones Web B2C del mes anterior.</p>
        </section>
      )}

      {analysis && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="% vs Web B2C mes −1"
              value={formatAbsPercent(analysis.tyYtd.pctB2c)}
              hint={`${formatCurrency(analysis.tyYtd.genCost)} de ${formatCurrency(analysis.tyYtd.b2cPrev)}`}
              tone={freeTone(analysis.extraEuros)}
            />
            <StatCard
              label="% LY mismo tramo"
              value={formatAbsPercent(analysis.lyYtd.pctB2c)}
              hint={`${formatCurrency(analysis.lyYtd.genCost)} de ${formatCurrency(analysis.lyYtd.b2cPrev)}`}
            />
            <StatCard
              label="% vs facturación zona"
              value={formatAbsPercent(analysis.pctZona)}
              hint={hasZonaSales
                ? `${formatCurrency(analysis.tyYtd.genCost)} de ${formatCurrency(analysis.zonaFactYtd)} de zona`
                : 'Sube el Teamsports en YTD / Por meses para cruzarlo'}
            />
            <StatCard
              label="% LY cierre vs B2C"
              value={formatAbsPercent(analysis.lyFull.pctB2c)}
              hint={`${formatCurrency(analysis.lyFull.genCost)} de ${formatCurrency(analysis.lyFull.b2cPrev)}`}
            />
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Ritmo vs año pasado</p>
            <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${freeTone(analysis.extraEuros)}`}>
              {paceLabel(analysis.extraEuros)}
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {analysis.extraEuros === null
                ? 'No hay comparativa con el año pasado.'
                : analysis.extraEuros < 0
                  ? `Vas retrasada: faltan ${formatCurrency(Math.abs(analysis.extraEuros))} de generados respecto al % LY sobre Web B2C. Se factura el mes siguiente: no lo dejes para febrero.`
                  : analysis.extraEuros > 0
                    ? `Vas adelantada ${formatCurrency(analysis.extraEuros)}. Ya están puestos vs el % del año pasado.`
                    : 'Vas en línea con el % del año pasado.'}
            </p>
          </section>

          <section>
            <div className="mb-3">
              <p className="text-sm font-semibold">Zonas</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                El % de contrato es sobre Web B2C del mes anterior. El % de zona es esos mismos euros sobre la facturación total de la zona.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {zonaRows.filter((row) => row.zona !== 'Sin zona').map((row) => (
                <div key={row.zona} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-sm font-semibold">{row.zona}</p>
                    <p className={`text-[11px] font-semibold ${freeTone(row.extra)}`}>{row.pending ? 'Sin meter' : paceLabel(row.extra)}</p>
                  </div>
                  <p className="mt-2 text-[12px] font-semibold tabular-nums text-[var(--text-primary)]">
                    {formatAbsPercent(row.ty.pctB2c)}
                    <span className="font-medium text-[var(--text-muted)]"> vs B2C</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    Cierre LY {formatAbsPercent(row.pctCierreLy)}
                    <span className="text-[var(--text-muted)]"> · mismo tramo {formatAbsPercent(row.ly.pctB2c)}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {formatCurrency(row.ty.genCost)} sobre {formatCurrency(row.ty.b2cPrev)} de Web B2C mes −1
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {hasZonaSales
                      ? `${formatAbsPercent(row.pctZona)} de la zona (${formatCurrency(row.zonaFact)})`
                      : 'Sin facturación de zona: sube Teamsports'}
                  </p>
                  <p className={`mt-3 text-sm font-semibold tabular-nums ${freeTone(row.extra)}`}>
                    {row.extra === null ? '—' : formatSignedCurrency(row.extra)}
                    <span className="ml-1 text-[11px] font-medium text-[var(--text-muted)]">vs ritmo LY</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">% vs Web B2C mes a mes</p>
            <div className="mt-4 grid grid-cols-12 gap-2">
              {analysis.monthly.map((month) => (
                <div key={month.index} className="flex flex-col items-center gap-1">
                  <div className="flex h-28 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 rounded-t bg-[var(--border-strong)]"
                      style={{ height: `${Math.max(month.ly.pctB2c ? (Math.min(Math.abs(month.ly.pctB2c), 80) / maxPct) * 100 : 0, month.ly.pctB2c ? 4 : 0)}%` }}
                      title={`LY ${month.label}: ${formatAbsPercent(month.ly.pctB2c)}`}
                    />
                    <div
                      className={`w-1/2 rounded-t ${month.index <= analysis.ytdMonth ? 'bg-[var(--danger)]' : 'bg-transparent'}`}
                      style={{ height: `${Math.max(month.ty.pctB2c ? (Math.min(Math.abs(month.ty.pctB2c), 80) / maxPct) * 100 : 0, month.ty.pctB2c ? 4 : 0)}%` }}
                      title={`TY ${month.label}: ${formatAbsPercent(month.ty.pctB2c)}`}
                    />
                  </div>
                  <p className="text-[10px] font-medium text-[var(--text-muted)]">{month.index}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Gris = año pasado. Rojo = este año. 1 = abril. El eje corta en 80% para que un mes raro no aplaste el resto.</p>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Detalle por zona</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Pincha una columna para ordenar.</p>
              </div>
              <button
                type="button"
                onClick={downloadZonas}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar zonas
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead className="bg-[var(--bg-soft)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    {([
                      ['zona', 'Zona', 'left'],
                      ['genCost', 'Gen. Web €', 'right'],
                      ['b2cPrev', 'Web B2C −1 €', 'right'],
                      ['pctB2c', '% vs B2C', 'right'],
                      ['pctLy', '% cierre LY', 'right'],
                      ['pctZona', '% vs zona', 'right'],
                      ['extra', 'Extra €', 'right'],
                    ] as const).map(([key, label, align]) => {
                      const active = sort.key === key;
                      const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                      return (
                        <th key={key} className="border-b border-[var(--border)] px-3 py-2 font-medium">
                          <button
                            type="button"
                            onClick={() => updateSort(key)}
                            className={`flex w-full items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
                          >
                            <span>{label}</span>
                            <Icon className={`h-3 w-3 ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {zonaRows.map((row) => (
                    <tr key={row.zona} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2">{row.zona}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.ty.genCost)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.ty.b2cPrev)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${freeTone(row.delta)}`}>{formatAbsPercent(row.ty.pctB2c)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatAbsPercent(row.pctCierreLy)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatAbsPercent(row.pctZona)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${freeTone(row.extra)}`}>{row.extra === null ? '—' : formatSignedCurrency(row.extra)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
