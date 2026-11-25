'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, History, Plus, RefreshCw, X } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { parseReceiptsSheet } from '@/lib/abonos-excel';
import {
  buildImportTemplate,
  parseImport,
  planAdd,
  planOverwrite,
  type ImportMode,
  type ParsedImport,
} from '@/lib/abonos-import';
import { formatIsoDate, formatMoney, statusLabel, asStatus, type AbonosState } from '@/lib/abonos-model';
import {
  createAbonosBackup,
  listAbonosBackups,
  loadAbonosBackup,
  type AbonosBackend,
  type AbonosBackup,
} from '@/lib/abonos-store';

function downloadBytes(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function formatBackupDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AbonosImportPanel({
  state,
  backend,
  people,
  onApply,
}: {
  state: AbonosState;
  backend: AbonosBackend;
  people: string[];
  onApply: (next: AbonosState, message: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<ImportMode>('add');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [receiptRows, setReceiptRows] = useState<ReturnType<typeof parseReceiptsSheet>>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<AbonosBackup[]>([]);
  const [backupsLoaded, setBackupsLoaded] = useState(false);

  const refreshBackups = useCallback(async () => {
    try {
      setBackups(await listAbonosBackups(backend));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido leer las copias de seguridad.');
    } finally {
      setBackupsLoaded(true);
    }
  }, [backend]);

  useEffect(() => { void refreshBackups(); }, [refreshBackups]);

  const reset = () => {
    setParsed(null);
    setFileName('');
    setReceiptRows([]);
    setConfirmed(false);
  };

  const downloadTemplate = async () => {
    try {
      setBusy('Preparando la plantilla…');
      downloadBytes(await buildImportTemplate(state.catalogs, people), 'Plantilla_abonos.xlsx');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido preparar la plantilla.');
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!parsed) return;
    setError(null);
    try {
      if (mode === 'add') {
        const plan = planAdd(state, parsed);
        if (plan.added === 0) {
          setError('No hay filas válidas para añadir.');
          return;
        }
        setBusy('Añadiendo…');
        await onApply(plan.state, `Añadidos ${plan.added} abono${plan.added === 1 ? '' : 's'} nuevos.`);
      } else {
        if (!confirmed) return;
        setBusy('Guardando copia de seguridad…');
        await createAbonosBackup(state, backend, `Antes de sobrescribir con ${fileName}`);
        const plan = planOverwrite(state, { ...parsed, receipts: receiptRows });
        setBusy('Sobrescribiendo…');
        await onApply(
          plan.state,
          `Abonos sobrescritos: ahora hay ${plan.added}. Antes había ${plan.removed}; la copia de seguridad está en Importar.`,
        );
        void refreshBackups();
      }
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido importar.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: AbonosBackup) => {
    const ok = window.confirm(
      `¿Restaurar la copia del ${formatBackupDate(backup.savedAt)} (${backup.count} abonos)?\n\nLo que hay ahora (${state.cases.length} abonos) se guarda antes como otra copia.`,
    );
    if (!ok) return;
    setError(null);
    try {
      setBusy('Guardando lo actual…');
      await createAbonosBackup(state, backend, 'Antes de restaurar una copia');
      setBusy('Restaurando…');
      const restored = await loadAbonosBackup(backup.id, backend);
      await onApply(restored, `Restaurada la copia del ${formatBackupDate(backup.savedAt)}: ${restored.cases.length} abonos.`);
      void refreshBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido restaurar la copia.');
    } finally {
      setBusy(null);
    }
  };

  const validCount = parsed?.valid.length ?? 0;
  const errorCount = parsed?.errors.length ?? 0;
  const overwriteBlocked = mode === 'overwrite' && (errorCount > 0 || validCount === 0);

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">Importar abonos</h3>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Descarga la plantilla, rellénala en Excel y súbela.</p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm font-semibold hover:bg-[var(--bg-soft)]"
          >
            <Download className="h-4 w-4" />
            Descargar plantilla
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setMode('add'); setConfirmed(false); }}
            className={`rounded-lg border p-4 text-left transition ${mode === 'add' ? 'border-[var(--text-primary)] ring-1 ring-[var(--text-primary)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Añadir</span>
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">Cada fila del Excel se añade como abono nuevo. No se toca nada de lo que ya hay.</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('overwrite')}
            className={`rounded-lg border p-4 text-left transition ${mode === 'overwrite' ? 'border-[var(--danger)] ring-1 ring-[var(--danger)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]"><RefreshCw className="h-4 w-4" /> Sobrescribir todo</span>
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">La lista pasa a ser exactamente la del Excel y se borra el resto. Antes se guarda una copia de seguridad.</span>
          </button>
        </div>

        {!parsed ? (
          <FileUpload
            inputId="abonos-import"
            label="Sube el Excel rellenado"
            hint={mode === 'add' ? 'Se añadirán como abonos nuevos.' : `Sustituirá los ${state.cases.length} abonos que hay ahora.`}
            onFileLoaded={(rows, name) => {
              setError(null);
              setFileName(name);
              setParsed(parseImport(rows));
              setConfirmed(false);
            }}
            onWorkbookLoaded={(sheets) => {
              const name = Object.keys(sheets).find((sheet) => sheet.trim().toLocaleLowerCase('es') === 'recepciones');
              setReceiptRows(name ? parseReceiptsSheet(sheets[name]) : []);
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2.5 text-sm">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-[var(--success)]" />
              <span className="min-w-0 flex-1 truncate font-medium">{fileName}</span>
              <span className="text-[var(--text-secondary)]">{validCount} lista{validCount === 1 ? '' : 's'}</span>
              {errorCount > 0 && <span className="font-medium text-[var(--danger)]">· {errorCount} con error</span>}
              <button type="button" onClick={reset} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Quitar archivo">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-auto rounded-md border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--bg-soft)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Marca</th>
                    <th className="px-3 py-2 font-semibold">Concepto</th>
                    <th className="px-3 py-2 font-semibold">Fecha prevista</th>
                    <th className="px-3 py-2 text-right font-semibold">Importe</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row) => (
                    <tr key={row.key} className={`border-t border-[var(--border)] ${row.error ? 'bg-[var(--danger-soft)]' : ''}`}>
                      <td className="px-3 py-2">{row.brand || '—'}</td>
                      <td className="px-3 py-2">
                        {row.comment || '—'}
                        {row.error && <span className="block text-xs font-medium text-[var(--danger)]">{row.error}</span>}
                      </td>
                      <td className="px-3 py-2">{formatIsoDate(row.dueDate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.expectedAmount)}</td>
                      <td className="px-3 py-2">{statusLabel(asStatus(row.status) || 'Pendiente')}</td>
                    </tr>
                  ))}
                  {parsed.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-[var(--text-muted)]">El Excel no tiene filas con datos.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {mode === 'add' && errorCount > 0 && validCount > 0 && (
              <p className="text-sm text-[var(--text-secondary)]">Las filas con error no se añaden. Corrígelas en el Excel y vuelve a subirlo si las quieres.</p>
            )}

            {mode === 'overwrite' && (
              <div className="space-y-3 rounded-lg border border-red-200 bg-[var(--danger-soft)] p-4 text-sm">
                <p className="flex items-start gap-2 font-semibold text-[var(--danger)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Ahora hay {state.cases.length} abonos. Después habrá {validCount}. Se borra todo lo demás.
                </p>
                <p className="text-[var(--text-secondary)]">
                  Antes de sobrescribir se guarda una copia de seguridad que puedes restaurar abajo. Si una fila lleva un Registro que ya existe, ese abono conserva sus documentos y cobros.
                </p>
                {errorCount > 0 ? (
                  <p className="font-medium text-[var(--danger)]">Hay {errorCount} fila{errorCount === 1 ? '' : 's'} con error. Corrígelas antes de sobrescribir para no perder abonos.</p>
                ) : (
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="accent-[var(--danger)]" />
                    Entiendo que se sustituyen todos los abonos
                  </label>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              {mode === 'add' ? (
                <button
                  type="button"
                  onClick={apply}
                  disabled={Boolean(busy) || validCount === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--text-primary)] px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  Añadir {validCount} abono{validCount === 1 ? '' : 's'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={apply}
                  disabled={Boolean(busy) || overwriteBlocked || !confirmed}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--danger)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  <RefreshCw className="h-4 w-4" />
                  Sobrescribir con {validCount} abono{validCount === 1 ? '' : 's'}
                </button>
              )}
              <button type="button" onClick={reset} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancelar</button>
            </div>
          </div>
        )}

        {busy && <p className="text-sm text-[var(--text-secondary)]">{busy}</p>}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[var(--text-muted)]" />
          <h3 className="text-sm font-semibold">Copias de seguridad</h3>
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Se crean solas antes de sobrescribir o restaurar. Restaurar devuelve los abonos, cobros y documentos a ese momento.</p>
        <div className="mt-3 rounded-md border border-[var(--border)]">
          {backups.map((backup, index) => (
            <div key={backup.id} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${index > 0 ? 'border-t border-[var(--border)]' : ''}`}>
              <span className="min-w-0 flex-1">{formatBackupDate(backup.savedAt)}</span>
              <span className="text-[var(--text-secondary)]">{backup.count} abonos</span>
              <button
                type="button"
                onClick={() => void restore(backup)}
                disabled={Boolean(busy)}
                className="rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold hover:bg-[var(--bg-soft)] disabled:opacity-40"
              >
                Restaurar
              </button>
            </div>
          ))}
          {backupsLoaded && backups.length === 0 && <p className="px-3 py-3 text-sm text-[var(--text-muted)]">Todavía no hay copias.</p>}
          {!backupsLoaded && <p className="px-3 py-3 text-sm text-[var(--text-muted)]">Cargando…</p>}
        </div>
      </div>
    </section>
  );
}
