'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  FRACCIONAR_COLUMNS,
  FRACCIONAR_VIEW_COLUMNS,
  defaultFraccionarColumnWidths,
  fraccionarJoin,
  fraccionarToAoa,
  parseAlbaranesForFraccionar,
  parseColectivosForFraccionar,
  parseDataSheet,
  type FraccionarRow,
} from '@/lib/fraccionar-excel';
import {
  emptyFraccionarState,
  historyZonaMatrix,
  sameFraccionarPhoto,
  snapshotFraccionarCarga,
  upsertFraccionarCarga,
  type FraccionarState,
} from '@/lib/fraccionar-model';
import { loadFraccionarState, saveFraccionarState, type FraccionarBackend } from '@/lib/fraccionar-store';
import { formatInt, formatIsoDate } from '@/lib/albaranes-model';
import { Download, Search } from 'lucide-react';

const TABS = [
  { id: 'carga', label: 'Carga' },
  { id: 'historico', label: 'Histórico' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const COL_WIDTHS_KEY = 'fraccionar-col-widths-v2';

function loadColumnWidths(): Record<string, number> {
  const fallback = defaultFraccionarColumnWidths();
  try {
    const raw = JSON.parse(window.localStorage.getItem(COL_WIDTHS_KEY) || '');
    if (!raw || typeof raw !== 'object') return fallback;
    return FRACCIONAR_COLUMNS.reduce((acc, col) => {
      const num = Number((raw as Record<string, unknown>)[col.key]);
      acc[col.key] = Number.isFinite(num) ? Math.min(col.max, Math.max(col.min, Math.round(num))) : col.width;
      return acc;
    }, {} as Record<string, number>);
  } catch {
    return fallback;
  }
}

function ColResize({ onMouseDown }: { onMouseDown: (event: ReactMouseEvent) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar columna"
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-[var(--text-primary)]/25"
      onMouseDown={onMouseDown}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function downloadAoa(rows: unknown[][], fileName: string) {
  void import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Fraccionar');
    XLSX.writeFile(wb, fileName);
  });
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{typeof value === 'number' ? formatInt(value) : value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

export default function FraccionarTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>('carga');
  const [albaranesRows, setAlbaranesRows] = useState<ReturnType<typeof parseAlbaranesForFraccionar>>([]);
  const [colectivosRows, setColectivosRows] = useState<ReturnType<typeof parseColectivosForFraccionar>>([]);
  const [dataRows, setDataRows] = useState<ReturnType<typeof parseDataSheet>>([]);
  const [albaranesName, setAlbaranesName] = useState('');
  const [colectivosName, setColectivosName] = useState('');
  const [dataName, setDataName] = useState('');
  const [query, setQuery] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>(defaultFraccionarColumnWidths);
  const [state, setState] = useState<FraccionarState>(emptyFraccionarState);
  const [backend, setBackend] = useState<FraccionarBackend>('local');
  const [hydrated, setHydrated] = useState(false);
  const [histMetric, setHistMetric] = useState<'count' | 'liberables'>('count');
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
  const stateRef = useRef(state);
  stateRef.current = state;

  const persist = useCallback(async (next: FraccionarState, currentBackend: FraccionarBackend) => {
    setState(next);
    try {
      await saveFraccionarState(next, currentBackend);
    } catch {
      /* local already written inside save */
    }
  }, []);

  useEffect(() => {
    setColWidths(loadColumnWidths());
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFraccionarState()
      .then((result) => {
        if (cancelled) return;
        setState(result.state);
        setBackend(result.backend);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => { cancelled = true; };
  }, []);

  const joined = useMemo(
    () => (dataRows.length && albaranesRows.length ? fraccionarJoin(dataRows, albaranesRows, colectivosRows) : []),
    [albaranesRows, colectivosRows, dataRows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return joined.filter((row) => {
      if (onlyIssues && !row.issue) return false;
      if (!q) return true;
      const hay = `${row.albaran} ${row.idAlbaran} ${row.codigoColectivo} ${row.nombreColectivo} ${row.agente} ${row.medio} ${row.zona} ${row.fechaAlbaran} ${row.fechaSalida} ${row.estado} ${row.issue || ''}`.toLocaleLowerCase('es');
      return hay.includes(q);
    });
  }, [joined, onlyIssues, query]);

  const matched = joined.filter((row) => !row.issue).length;
  const missingAlbaran = joined.filter((row) => row.issue === 'Sin albarán en el CSV').length;
  const missingCode = joined.filter((row) => row.issue === 'Sin código de colectivo').length;
  const unknownClub = joined.filter((row) => row.issue === 'Colectivo desconocido').length;

  const ready = dataRows.length > 0 && albaranesRows.length > 0 && colectivosRows.length > 0;
  const tableWidth = FRACCIONAR_VIEW_COLUMNS.reduce((sum, col) => sum + (colWidths[col.key] ?? col.width), 0);
  const history = useMemo(() => historyZonaMatrix(state), [state]);

  useEffect(() => {
    if (!hydrated || !dataRows.length) return;
    const carga = snapshotFraccionarCarga(dataRows, joined, dataName);
    const current = stateRef.current;
    const existing = current.cargas.find((item) => item.loadDate === carga.loadDate);
    if (existing && sameFraccionarPhoto(existing, carga)) return;
    void persist(upsertFraccionarCarga(current, carga), backend);
  }, [backend, dataName, dataRows, hydrated, joined, persist]);

  const resizeColumn = (key: string, event: ReactMouseEvent) => {
    const spec = FRACCIONAR_COLUMNS.find((col) => col.key === key);
    if (!spec) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = colWidthsRef.current[key] ?? spec.width;
    const move = (moveEvent: MouseEvent) => {
      const next = Math.min(spec.max, Math.max(spec.min, Math.round(startW + moveEvent.clientX - startX)));
      setColWidths((current) => ({ ...current, [key]: next }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidthsRef.current));
      } catch {
        /* ignore quota */
      }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="space-y-4">
      <WorkspaceChrome onBack={onBack} tabs={[...TABS]} active={tab} onSelect={(id) => setTab(id as TabId)} />
      {tab === 'carga' && (
      <>
      <p className="text-sm text-[var(--text-secondary)]">
        Sube Data, Albaranes y Colectivos. El Id de Data se cruza con Albaranes para traer el número de albarán y el código del colectivo; con ese código salen el nombre y el agente. Cada subida deja foto en Histórico por zona.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3">
          <FileUpload
            inputId="fraccionar-data"
            label="Data"
            hint="Excel data.xlsx: Id_albaran, zona, unidades, liberables."
            keepDropzone
            compact
            loaded={dataRows.length > 0}
            loadedName={dataName}
            onRawFile={(file) => {
              if (!/\.xlsx?$/i.test(file.name)) return;
              void (async () => {
                const XLSX = await import('xlsx');
                const buffer = await file.arrayBuffer();
                const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];
                const rows = parseDataSheet(data);
                setDataRows(rows);
                setDataName(file.name);
                setAck(rows.length ? `${formatInt(rows.length)} filas de Data.` : 'No he encontrado Id_albaran en Data.');
              })();
            }}
            onFileLoaded={(data, fileName) => {
              if (/\.xlsx?$/i.test(fileName)) return;
              const rows = parseDataSheet(data);
              setDataRows(rows);
              setDataName(fileName);
              setAck(rows.length ? `${formatInt(rows.length)} filas de Data.` : 'No he encontrado Id_albaran en Data.');
            }}
          />
          <Kpi label="Filas Data" value={dataRows.length} hint={dataName || 'Aún no hay fichero'} />
        </div>
        <div className="space-y-3">
          <FileUpload
            inputId="fraccionar-albaranes"
            label="Albaranes"
            hint="CSV del ERP. De aquí salen Albarán y Código de colectivo."
            keepDropzone
            compact
            loaded={albaranesRows.length > 0}
            loadedName={albaranesName}
            onFileLoaded={(data, fileName) => {
              const rows = parseAlbaranesForFraccionar(data);
              setAlbaranesRows(rows);
              setAlbaranesName(fileName);
              setAck(rows.length ? `${formatInt(rows.length)} albaranes.` : 'No he encontrado albaranes.');
            }}
          />
          <Kpi label="Albaranes" value={albaranesRows.length} hint={albaranesName || 'Aún no hay fichero'} />
        </div>
        <div className="space-y-3">
          <FileUpload
            inputId="fraccionar-colectivos"
            label="Colectivos"
            hint="CSV del ERP: Código, Nombre, Agente."
            keepDropzone
            compact
            loaded={colectivosRows.length > 0}
            loadedName={colectivosName}
            onFileLoaded={(data, fileName) => {
              const rows = parseColectivosForFraccionar(data);
              setColectivosRows(rows);
              setColectivosName(fileName);
              setAck(rows.length ? `${formatInt(rows.length)} colectivos.` : 'No he encontrado códigos de colectivo.');
            }}
          />
          <Kpi label="Colectivos" value={colectivosRows.length} hint={colectivosName || 'Aún no hay fichero'} />
        </div>
      </div>

      {joined.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Cruzados" value={matched} hint={`${formatInt(joined.length)} filas Data`} />
          <Kpi label="Sin albarán" value={missingAlbaran} hint="Id de Data que no está en el CSV" />
          <Kpi label="Sin código" value={missingCode} />
          <Kpi label="Colectivo desconocido" value={unknownClub} />
        </div>
      )}

      {ack ? <p className="text-sm text-[var(--text-secondary)]">{ack}</p> : null}

      {joined.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar"
                className="h-9 w-48 rounded-md border border-[var(--border)] bg-white pl-8 pr-3 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={onlyIssues} onChange={(event) => setOnlyIssues(event.target.checked)} />
              Solo incidencias
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold"
                onClick={() => {
                  const clean = joined.filter((row) => !row.issue);
                  downloadAoa(fraccionarToAoa(clean), 'fraccionar_sin_incidencias.xlsx');
                }}
                disabled={joined.every((row) => row.issue)}
              >
                <Download className="h-3.5 w-3.5" /> Excel sin incidencias
              </button>
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white"
                onClick={() => downloadAoa(fraccionarToAoa(filtered), 'fraccionar.xlsx')}
              >
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {formatInt(filtered.length)} filas. Arrastra el borde de cada columna para el ancho. El texto se adapta y no se corta.
          </p>
          <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table
              className="text-left text-xs"
              style={{ tableLayout: 'fixed', width: tableWidth }}
            >
              <colgroup>
                {FRACCIONAR_VIEW_COLUMNS.map((col) => (
                  <col key={col.key} style={{ width: colWidths[col.key] ?? col.width }} />
                ))}
              </colgroup>
              <thead className="bg-[var(--bg-soft)] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {FRACCIONAR_VIEW_COLUMNS.map((col) => (
                    <th key={col.key} className={`relative py-2 font-semibold align-top break-words ${col.numeric ? 'px-1.5' : 'px-2'}`}>
                      {col.viewLabel || col.label}
                      <ColResize onMouseDown={(event) => resizeColumn(col.key, event)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 400).map((row: FraccionarRow) => (
                  <tr key={row.key} className={`border-t border-[var(--border)] ${row.issue ? 'bg-amber-50/70' : ''}`}>
                    {FRACCIONAR_VIEW_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`py-2 align-top break-words ${col.numeric ? 'px-1.5 tabular-nums' : 'px-2'} ${col.key === 'albaran' ? 'font-medium' : ''} ${col.key === 'issue' ? 'text-amber-900' : ''}`}
                      >
                        {col.display(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 400 ? (
            <p className="text-xs text-[var(--text-muted)]">Muestro 400. El Excel lleva todas las filtradas.</p>
          ) : null}
        </div>
      )}

      {!ready && joined.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sube los tres ficheros. Con Data y Albaranes ya se ve el cruce; Colectivos completa nombre y agente.
        </p>
      ) : null}
      </>
      )}

      {tab === 'historico' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--text-secondary)]">
                Filas = zona. Columnas = día de subida. Si hay varias cargas el mismo día, cuenta la última.
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {formatInt(history.dates.length)} {history.dates.length === 1 ? 'día' : 'días'} con foto de albaranes fraccionables.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${histMetric === 'count' ? 'bg-[var(--text-primary)] text-white' : ''}`}
                onClick={() => setHistMetric('count')}
              >
                Nº albaranes
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${histMetric === 'liberables' ? 'bg-[var(--text-primary)] text-white' : ''}`}
                onClick={() => setHistMetric('liberables')}
              >
                Uds liberables
              </button>
            </div>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold"
              onClick={() => {
                const header = ['Zona', ...history.dates.map((date) => formatIsoDate(date)), 'Total'];
                const rows = history.rows.map((row) => {
                  const cells = row.values.map((item) => (histMetric === 'count' ? item.count : item.udsLiberables));
                  const total = cells.reduce((sum, item) => sum + item, 0);
                  return [row.zona, ...cells, total];
                });
                const totalRow = [
                  'Total',
                  ...history.totals.map((item) => (histMetric === 'count' ? item.count : item.udsLiberables)),
                  history.totals.reduce((sum, item) => sum + (histMetric === 'count' ? item.count : item.udsLiberables), 0),
                ];
                downloadAoa([header, ...rows, totalRow], `fraccionar_historico_${histMetric}.xlsx`);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
          {history.dates.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Aún no hay fotos. Sube Data en Carga para dejar el recuento del día por zona.
            </p>
          ) : (
            <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[var(--bg-soft)] uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="sticky left-0 z-20 whitespace-nowrap bg-[var(--bg-soft)] px-3 py-2 font-semibold">Zona</th>
                    {history.dates.map((date) => (
                      <th key={date} className="whitespace-nowrap px-2 py-2 text-right font-semibold">{formatIsoDate(date)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((row) => (
                    <tr key={row.zona} className="border-t border-[var(--border)]">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-3 py-2 font-medium">{row.zona}</td>
                      {row.values.map((item, index) => (
                        <td key={`${row.zona}-${history.dates[index]}`} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                          {formatInt(histMetric === 'count' ? item.count : item.udsLiberables)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--border)] font-semibold">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-3 py-2">Total</td>
                    {history.totals.map((item, index) => (
                      <td key={`total-${history.dates[index]}`} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                        {formatInt(histMetric === 'count' ? item.count : item.udsLiberables)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
