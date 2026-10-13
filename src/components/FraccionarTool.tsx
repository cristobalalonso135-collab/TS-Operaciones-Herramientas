'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  fraccionarJoin,
  fraccionarToAoa,
  parseAlbaranesForFraccionar,
  parseColectivosForFraccionar,
  parseDataSheet,
  type FraccionarRow,
} from '@/lib/fraccionar-excel';
import { formatInt } from '@/lib/albaranes-model';
import { Download, Search } from 'lucide-react';

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
  const [albaranesRows, setAlbaranesRows] = useState<ReturnType<typeof parseAlbaranesForFraccionar>>([]);
  const [colectivosRows, setColectivosRows] = useState<ReturnType<typeof parseColectivosForFraccionar>>([]);
  const [dataRows, setDataRows] = useState<ReturnType<typeof parseDataSheet>>([]);
  const [albaranesName, setAlbaranesName] = useState('');
  const [colectivosName, setColectivosName] = useState('');
  const [dataName, setDataName] = useState('');
  const [query, setQuery] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [ack, setAck] = useState<string | null>(null);

  const joined = useMemo(
    () => (dataRows.length && albaranesRows.length ? fraccionarJoin(dataRows, albaranesRows, colectivosRows) : []),
    [albaranesRows, colectivosRows, dataRows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return joined.filter((row) => {
      if (onlyIssues && !row.issue) return false;
      if (!q) return true;
      const hay = `${row.albaran} ${row.idAlbaran} ${row.codigoColectivo} ${row.nombreColectivo} ${row.agente} ${row.zona} ${row.estado} ${row.issue || ''}`.toLocaleLowerCase('es');
      return hay.includes(q);
    });
  }, [joined, onlyIssues, query]);

  const matched = joined.filter((row) => !row.issue).length;
  const missingAlbaran = joined.filter((row) => row.issue === 'Sin albarán en el CSV').length;
  const missingCode = joined.filter((row) => row.issue === 'Sin código de colectivo').length;
  const unknownClub = joined.filter((row) => row.issue === 'Colectivo desconocido').length;

  const ready = dataRows.length > 0 && albaranesRows.length > 0 && colectivosRows.length > 0;

  return (
    <div className="space-y-4">
      <WorkspaceChrome onBack={onBack} tabs={[{ id: 'carga', label: 'Fraccionar' }]} active="carga" onSelect={() => {}} />
      <p className="text-sm text-[var(--text-secondary)]">
        Sube Data, Albaranes y Colectivos. El Id de Data se cruza con Albaranes para traer el número de albarán y el código del colectivo; con ese código salen el nombre y el agente.
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
          <p className="text-xs text-[var(--text-muted)]">{formatInt(filtered.length)} filas.</p>
          <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--bg-soft)] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {['Albarán', 'Código', 'Colectivo', 'Agente', 'Zona', 'Estado', 'Uds', 'Liberables', 'Incidencia'].map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-2 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 400).map((row: FraccionarRow) => (
                  <tr key={row.key} className={`border-t border-[var(--border)] ${row.issue ? 'bg-amber-50/70' : ''}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{row.albaran || row.idAlbaran || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.codigoColectivo || '—'}</td>
                    <td className="px-3 py-2">{row.nombreColectivo || '—'}</td>
                    <td className="px-3 py-2">{row.agente || '—'}</td>
                    <td className="px-3 py-2">{row.zona || '—'}</td>
                    <td className="px-3 py-2">{row.estado || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.unidades ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.udsLiberables ?? '—'}</td>
                    <td className="px-3 py-2 text-amber-900">{row.issue || ''}</td>
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
    </div>
  );
}
