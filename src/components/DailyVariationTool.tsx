'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { getHolidayName } from '@/lib/holidays';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Search,
  Activity,
} from 'lucide-react';

interface WorkbookUpload {
  fileName: string;
  sheets: Record<string, any[][]>;
}

interface DailyVariationToolProps {
  onBack: () => void;
}

type SheetKind = 'Facturación' | 'COGS';

interface DayPoint {
  date: string;
  total: number;
}

interface DayJump {
  from: string;
  to: string;
  previous: number;
  current: number;
  diff: number;
  pct: number | null;
  monthBoundary: boolean;
}

interface MonthRow {
  monthStart: string;
  label: string;
  total: number;
  days: number;
  weekdayDays: number;
  avgDaily: number;
  avgWeekday: number;
  vsPrevPct: number | null;
  vsPrevAbs: number | null;
}

const CENTIMO = 0.01;
const DEFAULT_FROM = '2026-04-01';
const DEFAULT_TO = '2027-03-31';
const DEFAULT_THRESHOLD = 25;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/€/g, '').replace(/\s/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function formatDateKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'number' && value > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${year}-${month}-${day}`;
  }

  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const spanish = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (spanish) return `${spanish[3]}-${spanish[2].padStart(2, '0')}-${spanish[1].padStart(2, '0')}`;

  return null;
}

function displayDate(dateKey?: string): string {
  if (!dateKey) return '';
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

function displayMonth(dateKey?: string): string {
  if (!dateKey) return '';
  const [year, month] = dateKey.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function weekdayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWeekend(date: string): boolean {
  const day = weekdayIndex(date);
  return day === 0 || day === 6;
}

const WEEKDAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function displayDateWithWeekday(date?: string): string {
  if (!date) return '';
  return `${WEEKDAY_NAMES[weekdayIndex(date)]} ${displayDate(date)}`;
}

function findWideHeaderIndex(rows: any[][]): number {
  return rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell));
    return (
      normalized.includes('id_vertical')
      && normalized.includes('nombre')
      && normalized.includes('zona_equipaciones')
      && normalized.includes('cod_mercado')
    );
  });
}

function findSheet(workbook: WorkbookUpload, kind: SheetKind): { name: string; rows: any[][] } | null {
  for (const [name, rows] of Object.entries(workbook.sheets)) {
    const isCogs = normalizeText(name).includes('cogs');
    if (kind === 'COGS' && isCogs && findWideHeaderIndex(rows) >= 0) return { name, rows };
    if (kind === 'Facturación' && !isCogs && findWideHeaderIndex(rows) >= 0) return { name, rows };
  }
  return null;
}

function lineLabel(row: any[]): string {
  return [row[0], row[1], row[2], row[3]].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ');
}

function buildDailySeries(
  workbook: WorkbookUpload,
  kind: SheetKind,
  from: string,
  to: string,
  needle: string
): { series: DayPoint[]; sheetName: string | null; lineCount: number } {
  const sheet = findSheet(workbook, kind);
  if (!sheet) return { series: [], sheetName: null, lineCount: 0 };

  const headerIndex = findWideHeaderIndex(sheet.rows);
  if (headerIndex < 0) return { series: [], sheetName: sheet.name, lineCount: 0 };

  const dateColumns = sheet.rows[headerIndex]
    .map((cell, index) => ({ index, date: formatDateKey(cell) }))
    .filter((item): item is { index: number; date: string } => (
      !!item.date && item.date >= from && item.date <= to
    ));

  const totals = new Map<string, number>();
  dateColumns.forEach(({ date }) => totals.set(date, 0));

  let lineCount = 0;
  sheet.rows.slice(headerIndex + 1).forEach((row) => {
    const label = lineLabel(row);
    if (!label) return;
    if (needle && !normalizeText(label).includes(needle)) return;
    lineCount += 1;
    dateColumns.forEach(({ index, date }) => {
      const value = numericValue(row[index]);
      if (value === null) return;
      totals.set(date, (totals.get(date) || 0) + value);
    });
  });

  const series = dateColumns
    .map(({ date }) => ({ date, total: roundMoney(totals.get(date) || 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { series, sheetName: sheet.name, lineCount };
}

function buildJumps(activeDays: DayPoint[]): DayJump[] {
  const jumps: DayJump[] = [];
  for (let index = 1; index < activeDays.length; index += 1) {
    const previous = activeDays[index - 1];
    const current = activeDays[index];
    const diff = roundMoney(current.total - previous.total);
    const pct = Math.abs(previous.total) <= CENTIMO
      ? null
      : roundMoney(((current.total / previous.total) - 1) * 100);
    jumps.push({
      from: previous.date,
      to: current.date,
      previous: previous.total,
      current: current.total,
      diff,
      pct,
      monthBoundary: previous.date.slice(0, 7) !== current.date.slice(0, 7),
    });
  }
  return jumps;
}

function buildMonths(series: DayPoint[]): MonthRow[] {
  const buckets = new Map<string, { total: number; days: number; weekdayTotal: number; weekdayDays: number }>();
  series.forEach((day) => {
    const monthStart = `${day.date.slice(0, 7)}-01`;
    const existing = buckets.get(monthStart) || { total: 0, days: 0, weekdayTotal: 0, weekdayDays: 0 };
    existing.total += day.total;
    if (Math.abs(day.total) > CENTIMO) existing.days += 1;
    if (!isWeekend(day.date)) {
      existing.weekdayTotal += day.total;
      existing.weekdayDays += 1;
    }
    buckets.set(monthStart, existing);
  });

  const months = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthStart, bucket]) => ({
      monthStart,
      label: displayMonth(monthStart),
      total: roundMoney(bucket.total),
      days: bucket.days,
      weekdayDays: bucket.weekdayDays,
      avgDaily: bucket.days > 0 ? roundMoney(bucket.total / bucket.days) : 0,
      avgWeekday: bucket.weekdayDays > 0 ? roundMoney(bucket.weekdayTotal / bucket.weekdayDays) : 0,
      vsPrevPct: null as number | null,
      vsPrevAbs: null as number | null,
    }));

  months.forEach((month, index) => {
    if (index === 0) return;
    const previous = months[index - 1];
    month.vsPrevAbs = roundMoney(month.total - previous.total);
    month.vsPrevPct = Math.abs(previous.total) <= CENTIMO
      ? null
      : roundMoney(((month.total / previous.total) - 1) * 100);
  });

  return months;
}

function weekOfMonth(date: string): number {
  const day = Number(date.slice(8, 10));
  return Math.min(5, Math.ceil(day / 7));
}

function Sparkline({ points, weekdaysOnly }: { points: DayPoint[]; weekdaysOnly: boolean }) {
  const [hover, setHover] = useState<{ index: number; x: number } | null>(null);
  const visible = weekdaysOnly ? points.filter((point) => !isWeekend(point.date)) : points;

  if (visible.length === 0) {
    return (
      <p className="rounded-lg bg-[var(--bg-soft)] px-3 py-8 text-center text-sm text-[var(--text-secondary)]">
        No hay días laborables en el rango.
      </p>
    );
  }

  const max = Math.max(...visible.map((point) => Math.abs(point.total)), 1);
  const width = visible.length;
  const height = 112;
  const hovered = hover ? visible[hover.index] : null;
  const holidayName = hovered ? getHolidayName(hovered.date) : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-36 w-full cursor-crosshair rounded-lg bg-[var(--bg-soft)]"
        role="img"
        aria-label="Curva diaria"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
          const index = Math.min(visible.length - 1, Math.max(0, Math.floor(ratio * visible.length)));
          setHover({ index, x: event.clientX - rect.left });
        }}
        onMouseLeave={() => setHover(null)}
      >
        {visible.map((point, index) => {
          const barHeight = Math.max(2, (Math.abs(point.total) / max) * (height - 8));
          const isHoliday = !!getHolidayName(point.date);
          const isActive = hover?.index === index;
          return (
            <g key={point.date}>
              <rect x={index} y={0} width={1} height={height} fill={isActive ? 'rgba(31, 75, 122, 0.08)' : 'transparent'} />
              <rect
                x={index + 0.12}
                y={height - barHeight}
                width={0.76}
                height={barHeight}
                fill={isHoliday ? 'var(--warning)' : 'var(--accent)'}
                opacity={isActive ? 1 : isHoliday ? 0.95 : 0.82}
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: `clamp(96px, ${hover?.x || 0}px, calc(100% - 96px))`,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="font-semibold capitalize">{displayDateWithWeekday(hovered.date)}</p>
          <p className="mt-0.5 font-mono">{formatCurrency(hovered.total)}</p>
          {holidayName ? (
            <p className="mt-1 font-medium text-[var(--warning)]">Festivo Zaragoza · {holidayName}</p>
          ) : (
            <p className="mt-1 text-[var(--text-muted)]">Laborable</p>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        Pasa el ratón por una barra para ver el día. Las barras en ámbar son festivos de Zaragoza.
      </p>
    </div>
  );
}

export default function DailyVariationTool({ onBack }: DailyVariationToolProps) {
  const [workbook, setWorkbook] = useState<WorkbookUpload | null>(null);
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [kind, setKind] = useState<SheetKind>('Facturación');
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [query, setQuery] = useState('');
  const [includeWeekends, setIncludeWeekends] = useState(false);

  const analysis = useMemo(() => {
    if (!workbook) return null;
    const needle = normalizeText(query);
    const { series, sheetName, lineCount } = buildDailySeries(workbook, kind, from, to, needle);
    const curveDays = includeWeekends ? series : series.filter((day) => !isWeekend(day.date));
    const workDays = curveDays.filter((day) => Math.abs(day.total) > CENTIMO);
    const jumps = buildJumps(workDays);
    const months = buildMonths(series);
    const flagged = jumps.filter((jump) => jump.pct !== null && Math.abs(jump.pct) >= threshold);
    const boundaries = jumps.filter((jump) => jump.monthBoundary);
    const pcts = jumps.map((jump) => jump.pct).filter((value): value is number => value !== null);
    const absPcts = [...pcts].map((value) => Math.abs(value)).sort((a, b) => a - b);
    const medianAbsPct = absPcts.length === 0
      ? null
      : absPcts.length % 2 === 1
        ? absPcts[Math.floor(absPcts.length / 2)]
        : roundMoney((absPcts[absPcts.length / 2 - 1] + absPcts[absPcts.length / 2]) / 2);
    const maxJump = [...jumps].sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0))[0] || null;

    const weekRows: Array<{
      month: MonthRow;
      weeks: Array<{
        week: number;
        days: number;
        avg: number | null;
        vsPrevWeekPct: number | null;
        expected: number | null;
      }>;
      lastPrevWeek: number | null;
      entryPct: number | null;
      monthAvgPct: number | null;
    }> = [];

    months.forEach((month, monthIndex) => {
      const prefix = month.monthStart.slice(0, 7);
      const days = curveDays.filter((day) => day.date.startsWith(prefix));
      const previous = monthIndex > 0 ? months[monthIndex - 1] : null;
      const weeks = [1, 2, 3, 4, 5].map((week) => {
        const weekDays = days.filter((day) => weekOfMonth(day.date) === week);
        const total = weekDays.reduce((sum, day) => sum + day.total, 0);
        return {
          week,
          days: weekDays.length,
          avg: weekDays.length > 0 ? roundMoney(total / weekDays.length) : null,
          vsPrevWeekPct: null as number | null,
          expected: null as number | null,
        };
      });

      const filled = weeks.filter((week) => week.avg !== null);
      filled.forEach((week, index) => {
        if (!previous || filled.length === 0) {
          week.expected = month.avgWeekday;
          return;
        }
        const progress = filled.length === 1 ? 1 : index / (filled.length - 1);
        week.expected = roundMoney(previous.avgWeekday + (month.avgWeekday - previous.avgWeekday) * progress);
      });

      const firstAvg = filled[0]?.avg ?? null;
      const lastPrevWeek = monthIndex > 0
        ? weekRows[monthIndex - 1].weeks.filter((week) => week.avg !== null).slice(-1)[0]?.avg ?? null
        : null;
      const entryPct = firstAvg !== null && lastPrevWeek !== null && Math.abs(lastPrevWeek) > CENTIMO
        ? roundMoney(((firstAvg / lastPrevWeek) - 1) * 100)
        : null;
      const monthAvgPct = previous && Math.abs(previous.avgWeekday) > CENTIMO
        ? roundMoney(((month.avgWeekday / previous.avgWeekday) - 1) * 100)
        : null;

      weekRows.push({ month, weeks, lastPrevWeek, entryPct, monthAvgPct });
    });

    const chain: Array<{ avg: number; set: (pct: number | null) => void }> = [];
    weekRows.forEach((row) => {
      row.weeks.forEach((week) => {
        if (week.avg === null) return;
        chain.push({
          avg: week.avg,
          set: (pct) => { week.vsPrevWeekPct = pct; },
        });
      });
    });
    chain.forEach((item, index) => {
      if (index === 0) {
        item.set(null);
        return;
      }
      const previous = chain[index - 1].avg;
      item.set(Math.abs(previous) <= CENTIMO ? null : roundMoney(((item.avg / previous) - 1) * 100));
    });

    return {
      series,
      workDays,
      jumps,
      months,
      flagged,
      boundaries,
      medianAbsPct,
      maxJump,
      weekRows,
      sheetName,
      lineCount,
    };
  }, [workbook, kind, from, to, query, threshold, includeWeekends]);

  const downloadListado = async () => {
    if (!analysis || analysis.flagged.length === 0) return;
    const XLSX = await import('xlsx');
    const rows = [
      ['Tipo', 'Desde', 'Día desde', 'Hasta', 'Día hasta', 'Anterior €', 'Actual €', 'Dif. €', 'Var. %', 'Cambio de mes'],
      ...analysis.flagged.map((jump) => [
        jump.monthBoundary ? 'Borde de mes' : 'Laborable a laborable',
        jump.from,
        WEEKDAY_NAMES[weekdayIndex(jump.from)],
        jump.to,
        WEEKDAY_NAMES[weekdayIndex(jump.to)],
        jump.previous,
        jump.current,
        jump.diff,
        jump.pct,
        jump.monthBoundary ? 'Sí' : 'No',
      ]),
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Saltos');
    const baseName = (workbook?.fileName || 'diario').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(book, `${baseName}_variacion_${from}_${to}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Herramientas
      </button>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Control</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Suavidad diaria</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Mes vs mes usa el total real (findes incluidos). Semanas, bordes y saltos van solo en lunes–viernes:
              pocas líneas facturan el finde y eso inventaba caídas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">FY</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value || DEFAULT_FROM)}
              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--text-primary)]"
            />
            <span className="text-[var(--text-muted)]">→</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value || DEFAULT_TO)}
              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--text-primary)]"
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Budget diario</p>
            <p className="text-xs text-[var(--text-secondary)]">Hoja1 (facturación) y COGS · se suma todo el archivo, o filtras una línea</p>
          </div>
        </div>
        <FileUpload
          inputId="daily-variation-file"
          label="Sube el diario…"
          onFileLoaded={() => {}}
          onWorkbookLoaded={(sheets, fileName) => setWorkbook({ sheets, fileName })}
        />
        {workbook && <p className="mt-2 text-xs text-[var(--text-secondary)]">{workbook.fileName}</p>}
      </section>

      {!workbook || !analysis ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          Sube el diario para ver la curva del {displayDate(from)} al {displayDate(to)}.
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as SheetKind)}
              className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--text-primary)]"
            >
              <option value="Facturación">Facturación</option>
              <option value="COGS">COGS</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              Salto ≥
              <input
                type="number"
                min={1}
                max={200}
                value={threshold}
                onChange={(event) => setThreshold(Math.max(1, Number(event.target.value) || DEFAULT_THRESHOLD))}
                className="h-9 w-16 rounded-md border border-[var(--border)] bg-white px-2 text-sm outline-none focus:border-[var(--text-primary)]"
              />
              %
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={includeWeekends}
                onChange={(event) => setIncludeWeekends(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              Incluir fines de semana
            </label>
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrar por línea (vacío = todo el archivo)…"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--text-primary)]"
              />
            </div>
            <button
              type="button"
              onClick={downloadListado}
              disabled={analysis.flagged.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-4 w-4" />
              Exportar saltos
            </button>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">
                {includeWeekends ? 'Días con importe' : 'Laborables con importe'}
              </p>
              <p className="mt-1 text-lg font-semibold">{analysis.workDays.length}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {analysis.lineCount} línea(s) · {analysis.sheetName || kind}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Variación diaria típica</p>
              <p className="mt-1 text-lg font-semibold">{formatPct(analysis.medianAbsPct)}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                mediana |laborable vs anterior|
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Saltos ≥ {threshold}%</p>
              <p className={`mt-1 text-lg font-semibold ${analysis.flagged.length > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                {analysis.flagged.length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {analysis.boundaries.filter((jump) => jump.pct !== null && Math.abs(jump.pct) >= threshold).length} en borde de mes
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Mayor salto</p>
              <p className="mt-1 text-lg font-semibold">{formatPct(analysis.maxJump?.pct ?? null)}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {analysis.maxJump ? `${displayDateWithWeekday(analysis.maxJump.from)} → ${displayDateWithWeekday(analysis.maxJump.to)}` : '—'}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold">
                Curva {kind.toLowerCase()} {includeWeekends ? '' : '· lun–vie'}
              </h3>
            </div>
            {analysis.series.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No hay columnas de fecha en ese rango.</p>
            ) : (
              <Sparkline points={analysis.series} weekdaysOnly={!includeWeekends} />
            )}
          </section>

          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2">
              <p className="text-sm font-semibold">Mes vs mes anterior</p>
              <p className="text-xs text-[var(--text-secondary)]">
                El total incluye findes. La media es solo lun–vie (todos los laborables del mes, festivos a 0).
              </p>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Mes</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Total</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Laborables</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Media lun–vie</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Vs mes ant.</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif. €</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.months.map((month) => {
                    const big = month.vsPrevPct !== null && Math.abs(month.vsPrevPct) >= threshold;
                    return (
                      <tr key={month.monthStart} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 capitalize">{month.label}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(month.total)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{month.weekdayDays}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(month.avgWeekday)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${big ? 'text-[var(--danger)]' : ''}`}>
                          {formatPct(month.vsPrevPct)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {month.vsPrevAbs === null ? '—' : formatCurrency(month.vsPrevAbs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2">
              <p className="text-sm font-semibold">Media lun–vie por semana · vs crecimiento del mes</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Si el mes sube un X% en media laborable, las semanas deberían ir hacia ese ritmo:
                la semana 1 parecida a la última del mes anterior, y subir (o bajar) a lo largo del mes.
                El % bajo cada semana es vs la semana anterior. Entrada = última semana previa → semana 1.
              </p>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[1180px] border-collapse text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Mes</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Media mes</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Crec. mes</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Entrada</th>
                    {[1, 2, 3, 4, 5].map((week) => (
                      <th key={week} className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">
                        Sem. {week}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.weekRows.map((row) => {
                    const entryHot = row.entryPct !== null && Math.abs(row.entryPct) >= threshold;
                    const monthHot = row.monthAvgPct !== null && Math.abs(row.monthAvgPct) >= threshold;
                    const cliff = entryHot && (
                      row.monthAvgPct === null
                      || Math.abs(row.entryPct || 0) > Math.abs(row.monthAvgPct) + 8
                    );
                    return (
                      <tr key={row.month.monthStart} className="border-b border-[var(--border)] align-top">
                        <td className="px-3 py-2 capitalize font-medium">{row.month.label}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(row.month.avgWeekday)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${monthHot ? 'text-[var(--danger)]' : ''}`}>
                          {formatPct(row.monthAvgPct)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${cliff ? 'text-[var(--danger)]' : ''}`}>
                          {formatPct(row.entryPct)}
                          {cliff ? <div className="text-[10px] font-sans text-[var(--danger)]">salto &gt; mes</div> : null}
                        </td>
                        {row.weeks.map((week) => {
                          const weekHot = week.vsPrevWeekPct !== null && Math.abs(week.vsPrevWeekPct) >= threshold;
                          return (
                            <td key={week.week} className="px-3 py-2 text-right font-mono text-xs">
                              {week.avg === null ? '—' : (
                                <>
                                  <div>{formatCurrency(week.avg)}</div>
                                  <div className={weekHot ? 'text-[10px] text-[var(--danger)]' : 'text-[10px] text-[var(--text-muted)]'}>
                                    {formatPct(week.vsPrevWeekPct)}
                                  </div>
                                  {week.expected !== null ? (
                                    <div className="text-[10px] text-[var(--text-muted)]">
                                      esp. {formatCurrency(week.expected)}
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2">
              <p className="text-sm font-semibold">
                Bordes de mes ({includeWeekends ? 'último día con importe → primero del siguiente' : 'último lun–vie → primer lun–vie del siguiente'})
              </p>
            </div>
            <div className="max-h-[320px] overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Desde</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Hasta</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Anterior</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Siguiente</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif.</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Var. %</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.boundaries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                        No hay cambios de mes con importe en el rango.
                      </td>
                    </tr>
                  ) : analysis.boundaries.map((jump) => {
                    const big = jump.pct !== null && Math.abs(jump.pct) >= threshold;
                    return (
                      <tr key={`${jump.from}|${jump.to}`} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 text-xs">{displayDateWithWeekday(jump.from)}</td>
                        <td className="px-3 py-2 text-xs">{displayDateWithWeekday(jump.to)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(jump.previous)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(jump.current)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(jump.diff)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${big ? 'text-[var(--danger)]' : ''}`}>
                          {formatPct(jump.pct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">
              Saltos {includeWeekends ? 'día a día' : 'laborable a laborable'} ≥ {threshold}% ({analysis.flagged.length})
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Desde</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Hasta</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Tipo</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Anterior</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Actual</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif.</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Var. %</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.flagged.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                        Ningún laborable salta más de {threshold}% respecto al anterior.
                      </td>
                    </tr>
                  ) : analysis.flagged
                    .slice()
                    .sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0))
                    .slice(0, 200)
                    .map((jump) => (
                      <tr key={`${jump.from}|${jump.to}|flag`} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 text-xs">{displayDateWithWeekday(jump.from)}</td>
                        <td className="px-3 py-2 text-xs">{displayDateWithWeekday(jump.to)}</td>
                        <td className="px-3 py-2 text-xs">{jump.monthBoundary ? 'Borde de mes' : 'Dentro del mes'}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(jump.previous)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(jump.current)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(jump.diff)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-[var(--danger)]">{formatPct(jump.pct)}</td>
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
