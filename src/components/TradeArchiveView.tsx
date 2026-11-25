'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, FileText, Folder, ImagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  ARCHIVE_FORMS,
  TRADE_ARCHIVE_SETUP_SQL,
  companyYears,
  emptyRow,
  findFolder,
  formatBytes,
  fyDates,
  fyLabel,
  fyRangeLabel,
  isMissingBucketError,
  monthLabel,
  removeArchiveFile,
  signedUrls,
  updateFolder,
  uploadArchiveFile,
  type ArchiveFile,
  type ArchiveRow,
  type TradeArchive,
} from '@/lib/trade-archive';

const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,image/*';
const ROW_FIELDS: Array<{ key: keyof Omit<ArchiveRow, 'id' | 'form'>; label: string; placeholder: string; width: string }> = [
  { key: 'agreement', label: 'Acuerdo', placeholder: 'Teamwear', width: 'w-[12%]' },
  { key: 'concept', label: 'Concepto', placeholder: 'Data sharing H1', width: 'w-[25%]' },
  { key: 'rate', label: '% / importe', placeholder: '2 %', width: 'w-[13%]' },
  { key: 'base', label: 'Sobre qué', placeholder: 'Ventas netas licenciado', width: 'w-[21%]' },
  { key: 'payment', label: 'Cobro', placeholder: 'Jul 2027', width: 'w-[10%]' },
];

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      const borders = el.offsetHeight - el.clientHeight;
      el.style.height = `${el.scrollHeight + borders}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    let lastWidth = -1;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

function defaultFy(): number {
  return new Date().getFullYear() + 1;
}

export default function TradeArchiveView({
  archive,
  onChange,
}: {
  archive: TradeArchive;
  onChange: (next: TradeArchive) => Promise<void> | void;
}) {
  const [companyId, setCompanyId] = useState<string>(archive.companies[0]?.id || '');
  const [fy, setFy] = useState<number>(defaultFy());
  const [draftRows, setDraftRows] = useState<ArchiveRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState<{ name: string; month: number } | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const shotInputRef = useRef<HTMLInputElement | null>(null);
  const addFilesRef = useRef<(kind: ArchiveFile['kind'], files: Array<{ blob: Blob; name: string }>) => Promise<void>>(async () => {});

  const company = archive.companies.find((item) => item.id === companyId) || archive.companies[0] || null;
  const years = company ? companyYears(archive, company.id) : [];
  const folder = company ? findFolder(archive, company.id, fy) : null;
  const docs = useMemo(() => (folder?.files || []).filter((file) => file.kind === 'doc'), [folder]);
  const shots = useMemo(() => (folder?.files || []).filter((file) => file.kind === 'shot'), [folder]);
  const shotKey = shots.map((file) => file.path).join('|');

  useEffect(() => {
    if (!company && archive.companies[0]) setCompanyId(archive.companies[0].id);
  }, [archive.companies, company]);

  useEffect(() => {
    setDraftRows(folder?.rows || []);
  }, [folder?.id, folder?.rows]);

  useEffect(() => {
    const paths = shotKey ? shotKey.split('|') : [];
    if (paths.length === 0) return;
    let cancelled = false;
    signedUrls(paths)
      .then((map) => { if (!cancelled) setUrls((current) => ({ ...current, ...map })); })
      .catch((err) => { if (!cancelled) reportError(err); });
    return () => { cancelled = true; };
  }, [shotKey]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const images = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (images.length === 0) return;
      event.preventDefault();
      void addFilesRef.current('shot', images.map((file, index) => ({ blob: file, name: file.name && file.name !== 'image.png' ? file.name : `captura-${Date.now()}-${index + 1}.png` })));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (!viewer) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setViewer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  function reportError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingBucketError(message)) {
      setNeedsSetup(true);
      setError(null);
      return;
    }
    setError(message);
  }

  const saveRows = (rows: ArchiveRow[]) => {
    if (!company) return;
    void onChange(updateFolder(archive, company.id, fy, (current) => ({ ...current, rows })));
  };

  const rowsChanged = (rows: ArchiveRow[]) => JSON.stringify(rows) !== JSON.stringify(folder?.rows || []);

  const addFiles = async (kind: ArchiveFile['kind'], files: Array<{ blob: Blob; name: string }>) => {
    if (!company || files.length === 0) return;
    setError(null);
    setBusy(kind === 'doc' ? 'Subiendo documento…' : 'Subiendo captura…');
    const uploaded: ArchiveFile[] = [];
    try {
      for (const file of files) {
        uploaded.push(await uploadArchiveFile(company.id, fy, kind, file.blob, file.name));
      }
    } catch (err) {
      reportError(err);
    } finally {
      if (uploaded.length > 0) {
        await onChange(updateFolder(archive, company.id, fy, (current) => ({ ...current, rows: draftRows, files: [...current.files, ...uploaded] })));
      }
      setBusy(null);
    }
  };
  addFilesRef.current = addFiles;

  const openFile = async (file: ArchiveFile) => {
    try {
      const map = await signedUrls([file.path]);
      const url = map[file.path];
      if (!url) throw new Error('No he podido abrir el archivo.');
      if (file.kind === 'shot') setViewer(url);
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      reportError(err);
    }
  };

  const deleteFile = async (file: ArchiveFile) => {
    if (!company) return;
    if (!window.confirm(`¿Eliminar ${file.name}? No se puede deshacer.`)) return;
    try {
      await removeArchiveFile(file.path);
    } catch (err) {
      reportError(err);
      return;
    }
    await onChange(updateFolder(archive, company.id, fy, (current) => ({ ...current, rows: draftRows, files: current.files.filter((item) => item.id !== file.id) })));
  };

  const addCompany = async () => {
    if (!newCompany) return;
    const name = newCompany.name.trim();
    if (!name) return;
    if (archive.companies.some((item) => item.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
      setError(`${name} ya existe.`);
      return;
    }
    const id = crypto.randomUUID();
    await onChange({ ...archive, companies: [...archive.companies, { id, name, fyStartMonth: newCompany.month }] });
    setCompanyId(id);
    setNewCompany(null);
  };

  const changeStartMonth = (month: number) => {
    if (!company) return;
    void onChange({
      ...archive,
      companies: archive.companies.map((item) => (item.id === company.id ? { ...item, fyStartMonth: month } : item)),
    });
  };

  const addYear = () => {
    if (!company) return;
    const next = (years[years.length - 1] || defaultFy()) + 1;
    void onChange(updateFolder(archive, company.id, next, (current) => current));
    setFy(next);
  };

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(TRADE_ARCHIVE_SETUP_SQL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
        {archive.companies.map((item) => {
          const active = company?.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCompanyId(item.id)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${active ? 'border-[var(--text-primary)] bg-[var(--bg-card)]' : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'}`}
            >
              <Folder className={`h-4 w-4 shrink-0 ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.name}</span>
                <span className="block text-xs text-[var(--text-muted)]">{fyRangeLabel(item)}</span>
              </span>
            </button>
          );
        })}
        {newCompany ? (
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <input
              autoFocus
              value={newCompany.name}
              onChange={(event) => setNewCompany({ ...newCompany, name: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') void addCompany(); if (event.key === 'Escape') setNewCompany(null); }}
              placeholder="Puma"
              className="h-9 w-full rounded-md border border-[var(--border)] px-2 text-sm"
            />
            <label className="block text-xs text-[var(--text-secondary)]">
              El año empieza en
              <select
                value={newCompany.month}
                onChange={(event) => setNewCompany({ ...newCompany, month: Number(event.target.value) })}
                className="mt-1 h-9 w-full rounded-md border border-[var(--border)] px-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <option key={month} value={month}>{monthLabel(month)}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => void addCompany()} className="h-8 flex-1 rounded-md bg-[var(--text-primary)] text-xs font-semibold text-white">Crear</button>
              <button type="button" onClick={() => setNewCompany(null)} className="h-8 rounded-md border border-[var(--border)] px-3 text-xs">Cancelar</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewCompany({ name: '', month: 1 })}
            className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Plus className="h-4 w-4" />
            Nueva empresa
          </button>
        )}
      </div>

      {company ? (
        <div className="min-w-0 space-y-5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold tracking-tight">{company.name} · {fyLabel(fy)}</h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {fyDates(company, fy)} · el año empieza en
                <select
                  value={company.fyStartMonth}
                  onChange={(event) => changeStartMonth(Number(event.target.value))}
                  className="ml-1 rounded border border-transparent bg-transparent text-xs text-[var(--text-secondary)] hover:border-[var(--border)]"
                  aria-label="Mes en que empieza el año fiscal"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <option key={month} value={month}>{monthLabel(month)}</option>
                  ))}
                </select>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setFy(year)}
                  className={`h-8 rounded-md border px-3 text-xs font-semibold ${year === fy ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                >
                  {fyLabel(year)}
                </button>
              ))}
              <button type="button" onClick={addYear} className="flex h-8 items-center gap-1 rounded-md border border-dashed border-[var(--border-strong)] px-2.5 text-xs text-[var(--text-secondary)]" aria-label="Añadir año fiscal">
                <Plus className="h-3.5 w-3.5" />
                FY
              </button>
            </div>
          </div>

          {needsSetup && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Falta crear el espacio de archivos en Supabase</p>
              <p>Abre Supabase → SQL Editor, pega esto y dale a Run. Después vuelve a subir el archivo.</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-white p-3 text-xs text-[var(--text-primary)]">{TRADE_ARCHIVE_SETUP_SQL}</pre>
              <div className="flex gap-2">
                <button type="button" onClick={copySql} className="flex h-8 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiado' : 'Copiar SQL'}
                </button>
                <button type="button" onClick={() => setNeedsSetup(false)} className="h-8 rounded-md px-3 text-xs">Cerrar</button>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Resumen</p>
            <div className="overflow-x-auto rounded-md border border-[var(--border)]">
              <table className="w-full min-w-[960px] table-fixed text-sm">
                <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    {ROW_FIELDS.map((field) => (
                      <th key={field.key} className={`${field.width} px-2 py-2 font-medium`}>{field.label}</th>
                    ))}
                    <th className="w-[15%] px-2 py-2 font-medium">Forma</th>
                    <th className="w-[4%] px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draftRows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--border)] align-top">
                      {ROW_FIELDS.map((field) => (
                        <td key={field.key} className="px-1 py-1">
                          <AutoTextarea
                            value={row[field.key]}
                            placeholder={field.placeholder}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftRows((rows) => rows.map((item) => (item.id === row.id ? { ...item, [field.key]: value } : item)));
                            }}
                            onBlur={() => { if (rowsChanged(draftRows)) saveRows(draftRows); }}
                            className="block min-h-[34px] w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-1.5 py-1.5 text-sm leading-snug placeholder:text-[var(--text-muted)] hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <select
                          value={row.form}
                          onChange={(event) => {
                            const rows = draftRows.map((item) => (item.id === row.id ? { ...item, form: event.target.value as ArchiveRow['form'] } : item));
                            setDraftRows(rows);
                            saveRows(rows);
                          }}
                          className="h-[34px] w-full rounded border border-transparent bg-transparent px-1 text-sm hover:border-[var(--border)]"
                        >
                          <option value="">—</option>
                          {ARCHIVE_FORMS.map((form) => <option key={form} value={form}>{form}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const rows = draftRows.filter((item) => item.id !== row.id);
                            setDraftRows(rows);
                            saveRows(rows);
                          }}
                          className="inline-flex h-[34px] items-center px-1.5 text-[var(--text-muted)] hover:text-[var(--danger)]"
                          aria-label="Eliminar fila"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {draftRows.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-4 text-sm text-[var(--text-muted)]">Sin filas todavía. Añade lo que quieras tener a mano de este año.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => {
                const rows = [...draftRows, emptyRow(draftRows[draftRows.length - 1]?.agreement || '')];
                setDraftRows(rows);
                saveRows(rows);
              }}
              className="mt-2 flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--bg-soft)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir fila
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Documentos</p>
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={Boolean(busy)}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                Subir documento
              </button>
              <input
                ref={docInputRef}
                type="file"
                multiple
                accept={DOC_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  void addFiles('doc', files.map((file) => ({ blob: file, name: file.name })));
                }}
              />
            </div>
            <div className="rounded-md border border-[var(--border)]">
              {docs.map((file, index) => (
                <div key={file.id} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${index > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                  <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <button type="button" onClick={() => void openFile(file)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
                    {file.name}
                  </button>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">{formatBytes(file.size)}</span>
                  <button type="button" onClick={() => void openFile(file)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label={`Abrir ${file.name}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void deleteFile(file)} className="text-[var(--text-muted)] hover:text-[var(--danger)]" aria-label={`Eliminar ${file.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {docs.length === 0 && <p className="px-3 py-3 text-sm text-[var(--text-muted)]">Sin documentos. Sube el PDF, Word o Excel del acuerdo.</p>}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Capturas</p>
              <span className="text-xs text-[var(--text-muted)]">Pega con Ctrl+V en cualquier parte de esta pestaña</span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
              {shots.map((file) => (
                <div key={file.id} className="group relative overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-soft)]">
                  <button type="button" onClick={() => void openFile(file)} className="block aspect-[4/3] w-full">
                    {urls[file.path]
                      ? <img src={urls[file.path]} alt={file.name} className="h-full w-full object-cover object-top" />
                      : <span className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">Cargando…</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteFile(file)}
                    className="absolute right-1.5 top-1.5 hidden rounded bg-white/90 p-1 text-[var(--text-secondary)] shadow-sm hover:text-[var(--danger)] group-hover:block"
                    aria-label={`Eliminar ${file.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => shotInputRef.current?.click()}
                disabled={Boolean(busy)}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <ImagePlus className="h-5 w-5" />
                Añadir captura
              </button>
              <input
                ref={shotInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  void addFiles('shot', files.map((file) => ({ blob: file, name: file.name })));
                }}
              />
            </div>
          </div>

          {busy && <p className="text-xs text-[var(--text-secondary)]">{busy}</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-secondary)]">
          Crea la primera empresa para empezar.
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setViewer(null)}>
          <img src={viewer} alt="Captura" className="max-h-full max-w-full rounded-md bg-white shadow-xl" />
          <button type="button" onClick={() => setViewer(null)} className="absolute right-4 top-4 rounded-full bg-white p-2" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
