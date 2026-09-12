'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  ABONO_ORIGINS,
  ABONO_STATUSES,
  ABONOS_PEOPLE,
  computeAll,
  DEFAULT_NEW_AUTHOR,
  displayDash,
  formatIsoDate,
  formatMoney,
  mergeCatalog,
  myOpenQueue,
  nextRegistro,
  parseMoney,
  statusAfterReceipts,
  todayIso,
  type AbonoCase,
  type AbonoComputed,
  type AbonoOrigin,
  type AbonoReceipt,
  type AbonoStatus,
  type AbonosState,
  type TradeTerm,
} from '@/lib/abonos-model';
import {
  abonosExportRows,
  buildImportPreview,
  detectAbonosHeaderRow,
  guessColumnMap,
  previewToRecords,
  receiptsExportRows,
  type ImportColumnMap,
  type ImportPreviewRow,
} from '@/lib/abonos-excel';
import { addCatalogValue, loadAbonosState, saveAbonosState, type AbonosBackend } from '@/lib/abonos-store';
import { AlertTriangle, Plus, Search, Trash2, X } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'seguimiento', label: 'Abonos / Seguimiento' },
  { id: 'terms', label: 'Trade Terms' },
  { id: 'importar', label: 'Importar' },
  { id: 'exportar', label: 'Exportar' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type SortKey = 'registro' | 'dueDate' | 'brand' | 'type' | 'area' | 'teamMotivo' | 'origin' | 'expectedAmount' | 'receivedTotal' | 'pending' | 'status' | 'nextReview' | 'addedBy';

const emptyFilters = {
  brand: '',
  type: '',
  area: '',
  teamMotivo: '',
  origin: '',
  status: '',
  year: '',
  addedBy: '',
  overdue: false,
  review: false,
  search: '',
};

const emptyForm = (): Partial<AbonoCase> => ({
  addedBy: DEFAULT_NEW_AUTHOR,
  dueDate: '',
  brand: '',
  type: 'Credit Notes',
  area: '',
  teamMotivo: '',
  origin: 'Puntual',
  tradeTermId: null,
  informedBy: '',
  expectedAmount: null,
  status: 'Pendiente',
  nextReview: '',
  comment: '',
});

function CatalogField({
  label,
  value,
  options,
  required,
  allowFree,
  onChange,
  onAdd,
}: {
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  allowFree?: boolean;
  onChange: (value: string) => void;
  onAdd: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}{required ? ' *' : ''}</span>
      {adding || allowFree ? (
        <div className="flex gap-2">
          <input
            list={`${label}-list`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          />
          <datalist id={`${label}-list`}>
            {options.map((option) => <option key={option} value={option} />)}
          </datalist>
        </div>
      ) : (
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Selecciona</option>
            {options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-10 shrink-0 rounded-md border border-[var(--border)] px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            +
          </button>
        </div>
      )}
      {adding && !allowFree && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Nueva opción"
            className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const next = draft.trim();
              if (!next) return;
              onAdd(next);
              onChange(next);
              setDraft('');
              setAdding(false);
            }}
            className="h-9 rounded-md bg-[var(--text-primary)] px-3 text-xs font-medium text-white"
          >
            Añadir
          </button>
        </div>
      )}
    </label>
  );
}

export default function AbonosTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [state, setState] = useState<AbonosState | null>(null);
  const [backend, setBackend] = useState<AbonosBackend>('local');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'dueDate', dir: 'asc' });
  const [editing, setEditing] = useState<AbonoCase | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<Partial<AbonoCase>>(emptyForm());
  const [receiptDraft, setReceiptDraft] = useState({ receivedAt: todayIso(), amount: '', reference: '', comment: '' });
  const [importHeaders, setImportHeaders] = useState<unknown[]>([]);
  const [importRows, setImportRows] = useState<unknown[][]>([]);
  const [importMap, setImportMap] = useState<ImportColumnMap | null>(null);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [bulkArea, setBulkArea] = useState('Grassroots');
  const [termForm, setTermForm] = useState<Partial<TradeTerm>>({ brand: 'Adidas', name: '', compensation: '', triggerText: '', period: '', active: true, comment: '' });

  const persist = useCallback(async (next: AbonosState, currentBackend: AbonosBackend) => {
    setState(next);
    try {
      await saveAbonosState(next, currentBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar en el servidor. Queda en este navegador.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAbonosState()
      .then((result) => {
        if (cancelled) return;
        setState(result.state);
        setBackend(result.backend);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar abonos.');
      });
    return () => { cancelled = true; };
  }, []);

  const computed = useMemo(() => (state ? computeAll(state) : []), [state]);
  const filtered = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase('es');
    return computed.filter((row) => {
      if (filters.brand && row.brand !== filters.brand) return false;
      if (filters.type && row.type !== filters.type) return false;
      if (filters.area && row.area !== filters.area) return false;
      if (filters.teamMotivo && row.teamMotivo !== filters.teamMotivo) return false;
      if (filters.origin && row.origin !== filters.origin) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.addedBy && row.addedBy !== filters.addedBy) return false;
      if (filters.year && (row.dueDate || '').slice(0, 4) !== filters.year) return false;
      if (filters.overdue && row.overdueDays === null) return false;
      if (filters.review && !row.reviewOverdue) return false;
      if (search) {
        const blob = [row.registro, row.brand, row.type, row.area, row.teamMotivo, row.comment, row.informedBy, row.tradeTermName].join(' ').toLocaleLowerCase('es');
        if (!blob.includes(search)) return false;
      }
      return true;
    });
  }, [computed, filters]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      const result = String(left ?? '').localeCompare(String(right ?? ''), 'es', { numeric: true });
      return sort.dir === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sort]);

  const myQueue = useMemo(() => myOpenQueue(computed), [computed]);

  const kpis = useMemo(() => {
    return {
      pending: myQueue.reduce((sum, row) => sum + row.pending, 0),
      openCount: myQueue.length,
      noDate: myQueue.filter((row) => !row.dueDate).length,
    };
  }, [myQueue]);

  const peopleOptions = useMemo(() => {
    if (!state) return [...ABONOS_PEOPLE];
    return mergeCatalog([...ABONOS_PEOPLE], state.cases.map((row) => row.addedBy));
  }, [state]);

  if (!state) {
    return (
      <div className="abonos-shell rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-secondary)]">
        Cargando abonos…
      </div>
    );
  }

  const openNew = (preset?: Partial<AbonoCase>) => {
    setEditing(null);
    setForm({ ...emptyForm(), ...preset });
    setPanelOpen(true);
    setTab('seguimiento');
  };

  const openEdit = (row: AbonoCase) => {
    setEditing(row);
    setForm({ ...row, dueDate: row.dueDate || '', nextReview: row.nextReview || '' });
    setPanelOpen(true);
    setTab('seguimiento');
  };

  const saveForm = async () => {
    if (!form.brand || !form.area) {
      setError('Marca y área son obligatorios.');
      return;
    }
    setError(null);
    const row: AbonoCase = {
      id: editing?.id || crypto.randomUUID(),
      registro: editing?.registro || nextRegistro(state.cases),
      createdAt: editing ? (editing.createdAt || '') : new Date().toISOString(),
      addedBy: form.addedBy || '',
      dueDate: form.dueDate || null,
      brand: form.brand,
      type: form.type || '',
      area: form.area,
      teamMotivo: form.teamMotivo || '',
      origin: (form.origin || '') as AbonoOrigin | '',
      tradeTermId: form.origin === 'Trade Term' ? (form.tradeTermId || null) : null,
      informedBy: form.informedBy || '',
      expectedAmount: form.expectedAmount ?? null,
      status: (form.status || '') as AbonoStatus | '',
      nextReview: form.nextReview || null,
      comment: form.comment || '',
    };
    const cases = editing
      ? state.cases.map((item) => item.id === row.id ? row : item)
      : [row, ...state.cases];
    const catalogs = addCatalogValue(
      addCatalogValue(addCatalogValue(addCatalogValue(state.catalogs, 'brand', row.brand), 'type', row.type), 'area', row.area),
      'team',
      row.teamMotivo,
    );
    await persist({ ...state, cases, catalogs }, backend);
    setEditing(row);
    setForm(row);
    setPanelOpen(true);
    setNote('Guardado.');
  };

  const deleteCase = async (id: string) => {
    if (!window.confirm('¿Eliminar este abono y sus recepciones?')) return;
    await persist({
      ...state,
      cases: state.cases.filter((row) => row.id !== id),
      receipts: state.receipts.filter((row) => row.caseId !== id),
    }, backend);
    setEditing(null);
    setForm(emptyForm());
    setPanelOpen(false);
  };

  const cancelCase = async (id: string) => {
    const cases = state.cases.map((row) => row.id === id ? { ...row, status: 'Cancelado' as const } : row);
    await persist({ ...state, cases }, backend);
    if (editing?.id === id) setForm((current) => ({ ...current, status: 'Cancelado' }));
  };

  const addReceipt = async () => {
    if (!editing) return;
    const amount = parseMoney(receiptDraft.amount);
    if (!amount || amount === 0) {
      setError('El importe de la recepción es obligatorio.');
      return;
    }
    const receipt: AbonoReceipt = {
      id: crypto.randomUUID(),
      caseId: editing.id,
      receivedAt: receiptDraft.receivedAt || todayIso(),
      amount,
      reference: receiptDraft.reference.trim(),
      comment: receiptDraft.comment.trim(),
    };
    const receipts = [...state.receipts, receipt];
    const received = receipts.filter((item) => item.caseId === editing.id).reduce((sum, item) => sum + item.amount, 0);
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus } : row);
    await persist({ ...state, receipts, cases }, backend);
    setEditing({ ...editing, status: nextStatus });
    setForm((current) => ({ ...current, status: nextStatus }));
    setReceiptDraft({ receivedAt: todayIso(), amount: '', reference: '', comment: '' });
    setNote('Recepción añadida.');
  };

  const deleteReceipt = async (id: string) => {
    if (!editing) return;
    const receipts = state.receipts.filter((row) => row.id !== id);
    const received = receipts.filter((item) => item.caseId === editing.id).reduce((sum, item) => sum + item.amount, 0);
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus } : row);
    await persist({ ...state, receipts, cases }, backend);
  };

  const saveTerm = async () => {
    if (!termForm.brand || !termForm.name) {
      setError('Marca y nombre del trade term son obligatorios.');
      return;
    }
    const term: TradeTerm = {
      id: crypto.randomUUID(),
      brand: termForm.brand,
      name: termForm.name,
      compensation: termForm.compensation || '',
      triggerText: termForm.triggerText || '',
      period: termForm.period || '',
      active: termForm.active !== false,
      comment: termForm.comment || '',
    };
    await persist({
      ...state,
      tradeTerms: [term, ...state.tradeTerms],
      catalogs: addCatalogValue(state.catalogs, 'brand', term.brand),
    }, backend);
    setTermForm({ brand: term.brand, name: '', compensation: '', triggerText: '', period: '', active: true, comment: '' });
  };

  const toggleTerm = async (id: string) => {
    await persist({
      ...state,
      tradeTerms: state.tradeTerms.map((term) => term.id === id ? { ...term, active: !term.active } : term),
    }, backend);
  };

  const deleteTerm = async (id: string) => {
    if (!window.confirm('¿Eliminar este trade term?')) return;
    await persist({
      ...state,
      tradeTerms: state.tradeTerms.filter((term) => term.id !== id),
      cases: state.cases.map((row) => row.tradeTermId === id ? { ...row, tradeTermId: null } : row),
    }, backend);
  };

  const handleImportFile = (rows: unknown[][]) => {
    const index = detectAbonosHeaderRow(rows);
    const header = rows[index] || [];
    const map = guessColumnMap(header);
    setHeaderIndex(index);
    setImportHeaders(header);
    setImportRows(rows);
    setImportMap(map);
    setPreview(buildImportPreview(rows, map, index));
    setTab('importar');
  };

  const applyImport = async () => {
    const { cases, receipts } = previewToRecords(preview);
    const used = new Set(state.cases.map((row) => row.registro));
    let nextReg = nextRegistro(state.cases);
    const imported = cases.map((row) => {
      if (!used.has(row.registro)) {
        used.add(row.registro);
        return row;
      }
      const next = { ...row, registro: nextReg };
      used.add(nextReg);
      nextReg += 1;
      return next;
    });
    await persist({
      ...state,
      cases: [...imported, ...state.cases],
      receipts: [...receipts, ...state.receipts],
    }, backend);
    setNote(`Importados ${imported.length} abonos.`);
    setPreview([]);
    setTab('seguimiento');
  };

  const exportWorkbook = async (rows: AbonoComputed[]) => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(abonosExportRows(rows)), 'Abonos');
    const caseIds = new Set(rows.map((row) => row.id));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(receiptsExportRows(rows, state.receipts.filter((item) => caseIds.has(item.caseId)))),
      'Recepciones',
    );
    XLSX.writeFile(workbook, 'Abonos.xlsx');
  };

  const currentComputed = editing ? computed.find((row) => row.id === editing.id) : null;
  const caseReceipts = editing ? state.receipts.filter((row) => row.caseId === editing.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)) : [];
  const brandTerms = state.tradeTerms.filter((term) => term.brand === form.brand && term.active !== false);
  const years = Array.from(new Set(computed.map((row) => (row.dueDate || '').slice(0, 4)).filter(Boolean))).sort();

  const toggleSort = (key: SortKey) => {
    setSort((current) => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  return (
    <div className="abonos-shell space-y-4">
      <WorkspaceChrome onBack={onBack} tabs={[...TABS]} active={tab} onSelect={(id) => setTab(id as TabId)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">05 Abonos</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Seguimiento de compensaciones</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Lo que las marcas nos deben: trade terms y casos puntuales, hasta que entra el dinero.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNew()}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Nuevo abono
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}
      {note && (
        <p className="text-xs font-medium text-[var(--success)]">{note}</p>
      )}

      {tab === 'dashboard' && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Te tocan" value={String(kpis.openCount)} />
            <Kpi label="Pendiente en los tuyos" value={formatMoney(kpis.pending)} />
            <Kpi label="Sin fecha prevista" value={String(kpis.noDate)} tone={kpis.noDate ? 'warning' : undefined} />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm font-semibold">Lo que te toca</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Casos a tu nombre que no están cerrados. Lo de Pablo está en Abonos / Seguimiento.
            </p>
            <div className="mt-3 space-y-2">
              {myQueue.length === 0 && (
                <p className="text-sm text-[var(--text-secondary)]">Nada abierto a tu nombre.</p>
              )}
              {myQueue.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openEdit(row)}
                  className="flex w-full items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-left hover:border-[var(--border-strong)]"
                >
                  <div>
                    <p className="text-sm font-medium">#{row.registro} · {displayDash(row.brand)} · {displayDash(row.area)} · {displayDash(row.teamMotivo)}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{displayDash(row.type)} · previsto {formatIsoDate(row.dueDate)} · {displayDash(row.status)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatMoney(row.pending)}</p>
                    {row.overdueDays !== null && <p className="text-[11px] font-medium text-[var(--danger)]">Vencido hace {row.overdueDays} días</p>}
                    {row.overdueDays === null && row.reviewOverdue && <p className="text-[11px] font-medium text-[var(--warning)]">Revisar hoy</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === 'seguimiento' && (
        <section className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Buscar" className="h-10 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-sm" />
            </label>
            <FilterSelect value={filters.brand} options={state.catalogs.brands} placeholder="Marca" onChange={(brand) => setFilters({ ...filters, brand })} />
            <FilterSelect value={filters.type} options={state.catalogs.types} placeholder="Tipo" onChange={(type) => setFilters({ ...filters, type })} />
            <FilterSelect value={filters.area} options={state.catalogs.areas} placeholder="Área" onChange={(area) => setFilters({ ...filters, area })} />
            <FilterSelect value={filters.teamMotivo} options={state.catalogs.teams} placeholder="Equipo / Motivo" onChange={(teamMotivo) => setFilters({ ...filters, teamMotivo })} />
            <FilterSelect value={filters.origin} options={[...ABONO_ORIGINS]} placeholder="Origen" onChange={(origin) => setFilters({ ...filters, origin })} />
            <FilterSelect value={filters.status} options={[...ABONO_STATUSES]} placeholder="Estado" onChange={(status) => setFilters({ ...filters, status })} />
            <FilterSelect value={filters.year} options={years} placeholder="Año" onChange={(year) => setFilters({ ...filters, year })} />
            <FilterSelect value={filters.addedBy} options={peopleOptions} placeholder="Añadido por" onChange={(addedBy) => setFilters({ ...filters, addedBy })} />
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={filters.overdue} onChange={(event) => setFilters({ ...filters, overdue: event.target.checked })} />
              Vencidos
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={filters.review} onChange={(event) => setFilters({ ...filters, review: event.target.checked })} />
              Pendientes de revisión
            </label>
          </div>

          <div className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-[1180px] w-full border-collapse text-sm">
              <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  {([
                    ['registro', 'Registro'],
                    ['dueDate', 'Fecha prevista'],
                    ['brand', 'Empresa'],
                    ['type', 'Tipo'],
                    ['area', 'Área'],
                    ['teamMotivo', 'Equipo / Motivo'],
                    ['origin', 'Origen'],
                    ['expectedAmount', 'Previsto'],
                    ['receivedTotal', 'Recibido'],
                    ['pending', 'Pendiente'],
                    ['status', 'Estado'],
                    ['nextReview', 'Próx. revisión'],
                    ['addedBy', 'Añadido por'],
                  ] as Array<[SortKey, string]>).map(([key, label]) => (
                    <th key={key} className="border-b border-[var(--border)] px-3 py-2 font-medium">
                      <button type="button" onClick={() => toggleSort(key)} className="hover:text-[var(--text-primary)]">{label}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} onClick={() => openEdit(row)} className="cursor-pointer hover:bg-white">
                    <td className="border-b border-[var(--border)] px-3 py-2 font-medium">#{row.registro}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{formatIsoDate(row.dueDate)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{displayDash(row.brand)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{displayDash(row.type)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{displayDash(row.area)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{displayDash(row.teamMotivo)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{displayDash(row.origin)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatMoney(row.expectedAmount)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatMoney(row.receivedTotal)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatMoney(row.pending)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">
                      <StatusPill row={row} />
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{formatIsoDate(row.nextReview)}</td>
                    <td className="border-b border-[var(--border)] px-3 py-2">{displayDash(row.addedBy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && <p className="p-4 text-sm text-[var(--text-secondary)]">No hay abonos con estos filtros.</p>}
          </div>

          {(panelOpen) && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">{editing ? `Registro #${editing.registro}` : 'Nuevo abono'}</p>
                  <button type="button" onClick={() => { setEditing(null); setForm(emptyForm()); setPanelOpen(false); }} className="text-[var(--text-muted)]"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <CatalogField label="Marca" value={form.brand || ''} options={state.catalogs.brands} required onChange={(brand) => setForm({ ...form, brand, tradeTermId: null })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'brand', value) }, backend)} />
                  <CatalogField label="Área" value={form.area || ''} options={state.catalogs.areas} required onChange={(area) => setForm({ ...form, area })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'area', value) }, backend)} />
                  <CatalogField label="Equipo / Motivo" value={form.teamMotivo || ''} options={state.catalogs.teams} allowFree onChange={(teamMotivo) => setForm({ ...form, teamMotivo })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'team', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Origen</span>
                    <select value={form.origin || ''} onChange={(event) => setForm({ ...form, origin: event.target.value as AbonoOrigin | '', tradeTermId: event.target.value === 'Trade Term' ? form.tradeTermId : null })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {ABONO_ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                    </select>
                  </label>
                  <CatalogField label="Tipo" value={form.type || ''} options={state.catalogs.types} required onChange={(type) => setForm({ ...form, type })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'type', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Importe previsto</span>
                    <input value={form.expectedAmount ?? ''} onChange={(event) => setForm({ ...form, expectedAmount: parseMoney(event.target.value) })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-right font-mono text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha prevista</span>
                    <input type="date" value={form.dueDate || ''} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  {form.origin === 'Trade Term' && (
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Trade Term</span>
                      <select value={form.tradeTermId || ''} onChange={(event) => setForm({ ...form, tradeTermId: event.target.value || null })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                        <option value="">Selecciona</option>
                        {brandTerms.map((term) => <option key={term.id} value={term.id}>{term.name} · {term.compensation}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Añadido por</span>
                    <select value={form.addedBy || ''} onChange={(event) => setForm({ ...form, addedBy: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {peopleOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Informado por</span>
                    <input value={form.informedBy || ''} onChange={(event) => setForm({ ...form, informedBy: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Estado</span>
                    <select value={form.status || ''} onChange={(event) => setForm({ ...form, status: event.target.value as AbonoStatus | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {ABONO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Próxima revisión</span>
                    <input type="date" value={form.nextReview || ''} onChange={(event) => setForm({ ...form, nextReview: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Comentario</span>
                    <textarea value={form.comment || ''} onChange={(event) => setForm({ ...form, comment: event.target.value })} rows={3} className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm" />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={saveForm} className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar</button>
                  {editing && (
                    <>
                      <button type="button" onClick={() => cancelCase(editing.id)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar caso</button>
                      <button type="button" onClick={() => deleteCase(editing.id)} className="rounded-md px-4 py-2 text-sm text-[var(--danger)]">Eliminar</button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs text-[var(--text-secondary)]">Importe previsto</p>
                  <p className="text-xl font-semibold">{formatMoney(currentComputed?.expectedAmount ?? form.expectedAmount ?? null)}</p>
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">Total recibido</p>
                  <p className="text-xl font-semibold text-[var(--success)]">{formatMoney(currentComputed?.receivedTotal ?? 0)}</p>
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">Pendiente</p>
                  <p className="text-xl font-semibold">{formatMoney(currentComputed?.pending ?? Math.max(0, (form.expectedAmount ?? 0)))}</p>
                  {currentComputed?.overdueDays !== null && currentComputed?.overdueDays !== undefined && (
                    <p className="mt-3 text-sm font-medium text-[var(--danger)]">Vencido hace {currentComputed.overdueDays} días</p>
                  )}
                  {currentComputed?.reviewOverdue && (
                    <p className="mt-1 text-sm font-medium text-[var(--warning)]">Revisar hoy</p>
                  )}
                </div>
                {editing && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                    <p className="text-sm font-semibold">Recepciones</p>
                    <div className="mt-3 space-y-2">
                      {caseReceipts.map((receipt) => (
                        <div key={receipt.id} className="flex items-start justify-between gap-2 rounded-md bg-[var(--bg-soft)] px-3 py-2 text-sm">
                          <div>
                            <p className="font-medium">{formatIsoDate(receipt.receivedAt)} · {formatMoney(receipt.amount)}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{receipt.reference || receipt.comment || '—'}</p>
                          </div>
                          <button type="button" onClick={() => deleteReceipt(receipt.id)} className="text-[var(--danger)]"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                      {caseReceipts.length === 0 && <p className="text-xs text-[var(--text-secondary)]">Aún no hay recepciones.</p>}
                    </div>
                    <div className="mt-3 grid gap-2">
                      <input type="date" value={receiptDraft.receivedAt} onChange={(event) => setReceiptDraft({ ...receiptDraft, receivedAt: event.target.value })} className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <input value={receiptDraft.amount} onChange={(event) => setReceiptDraft({ ...receiptDraft, amount: event.target.value })} placeholder="Importe" className="h-9 rounded-md border border-[var(--border)] px-3 text-right font-mono text-sm" />
                      <input value={receiptDraft.reference} onChange={(event) => setReceiptDraft({ ...receiptDraft, reference: event.target.value })} placeholder="Referencia" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <input value={receiptDraft.comment} onChange={(event) => setReceiptDraft({ ...receiptDraft, comment: event.target.value })} placeholder="Comentario" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <button type="button" onClick={addReceipt} className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Añadir recepción</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'terms' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm font-semibold">Nuevo trade term</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CatalogField label="Marca" value={termForm.brand || ''} options={state.catalogs.brands} required onChange={(brand) => setTermForm({ ...termForm, brand })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'brand', value) }, backend)} />
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Nombre / Condición</span>
                <input value={termForm.name || ''} onChange={(event) => setTermForm({ ...termForm, name: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Compensación</span>
                <input value={termForm.compensation || ''} onChange={(event) => setTermForm({ ...termForm, compensation: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Trigger / Condición</span>
                <input value={termForm.triggerText || ''} onChange={(event) => setTermForm({ ...termForm, triggerText: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha / Periodicidad</span>
                <input value={termForm.period || ''} onChange={(event) => setTermForm({ ...termForm, period: event.target.value })} placeholder="JUL, DIC, Anual…" className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Comentario</span>
                <input value={termForm.comment || ''} onChange={(event) => setTermForm({ ...termForm, comment: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
            </div>
            <button type="button" onClick={saveTerm} className="mt-3 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar trade term</button>
          </div>
          <div className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2">Marca</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Compensación</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {state.tradeTerms.map((term) => (
                  <tr key={term.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{term.brand}</td>
                    <td className="px-3 py-2 font-medium">{term.name}</td>
                    <td className="px-3 py-2">{term.compensation}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{term.triggerText || '—'}</td>
                    <td className="px-3 py-2">{term.period || '—'}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => toggleTerm(term.id)} className="text-xs font-semibold">{term.active ? 'Sí' : 'No'}</button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => openNew({ brand: term.brand, origin: 'Trade Term', tradeTermId: term.id, type: 'Credit Notes' })} className="mr-3 text-xs font-semibold text-[var(--accent)]">Crear seguimiento</button>
                      <button type="button" onClick={() => deleteTerm(term.id)} className="text-xs text-[var(--danger)]">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'importar' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <FileUpload
              inputId="abonos-import"
              label="Importar Excel de abonos"
              hint="Una sola carga. Área: B2B, Grassroots, Pro Clubs o Teamsports. Los huecos (tipo, fecha, estado) entran igual."
              onFileLoaded={handleImportFile}
              keepDropzone
            />
          </div>
          {importMap && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-sm font-semibold">Relacionar columnas</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {Object.entries(importMap).map(([key, value]) => (
                  <label key={key} className="space-y-1 text-xs">
                    <span className="text-[var(--text-secondary)]">{key}</span>
                    <select
                      value={value ?? ''}
                      onChange={(event) => {
                        const next = { ...importMap, [key]: event.target.value === '' ? null : Number(event.target.value) };
                        setImportMap(next);
                        setPreview(buildImportPreview(importRows, next, headerIndex));
                      }}
                      className="h-9 w-full rounded-md border border-[var(--border)] px-2"
                    >
                      <option value="">No usar</option>
                      {importHeaders.map((header, index) => (
                        <option key={`${String(header)}-${index}`} value={index}>{String(header || `Columna ${index + 1}`)}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          {preview.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <p className="text-sm font-semibold">{preview.length} filas · Área y Añadido por salen del Excel. Completa las vacías si falta alguna.</p>
                <select value={bulkArea} onChange={(event) => setBulkArea(event.target.value)} className="h-9 rounded-md border border-[var(--border)] px-2 text-sm">
                  {state.catalogs.areas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setPreview(preview.map((row) => row.area ? row : { ...row, area: bulkArea }))}
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-xs font-medium"
                >
                  Rellenar vacías
                </button>
                <button type="button" onClick={applyImport} className="h-9 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white">Confirmar importación</button>
                <datalist id="abonos-import-people">
                  {peopleOptions.map((person) => <option key={person} value={person} />)}
                </datalist>
              </div>
              <div className="max-h-[480px] overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-[var(--bg-soft)] text-left text-xs">
                    <tr>
                      <th className="px-2 py-2">Reg.</th>
                      <th className="px-2 py-2">Empresa</th>
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Equipo/Motivo</th>
                      <th className="px-2 py-2">Área</th>
                      <th className="px-2 py-2">Añadido por</th>
                      <th className="px-2 py-2">Previsto</th>
                      <th className="px-2 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={row.key} className="border-t border-[var(--border)]">
                        <td className="px-2 py-1">{row.registro ?? '—'}</td>
                        <td className="px-2 py-1">{row.brand}</td>
                        <td className="px-2 py-1">{row.type}</td>
                        <td className="px-2 py-1">{row.teamMotivo}</td>
                        <td className="px-2 py-1">
                          <select
                            value={row.area}
                            onChange={(event) => {
                              const next = [...preview];
                              next[index] = { ...row, area: event.target.value };
                              setPreview(next);
                            }}
                            className="h-8 rounded border border-[var(--border)] px-1 text-xs"
                          >
                            <option value="">Sin área</option>
                            {mergeCatalog(state.catalogs.areas, [row.area]).map((area) => <option key={area} value={area}>{area}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={row.addedBy}
                            onChange={(event) => {
                              const next = [...preview];
                              next[index] = { ...row, addedBy: event.target.value };
                              setPreview(next);
                            }}
                            list="abonos-import-people"
                            className="h-8 w-full min-w-[140px] rounded border border-[var(--border)] px-1 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{formatMoney(row.expectedAmount)}</td>
                        <td className="px-2 py-1 text-[var(--danger)]">{row.error || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'exportar' && (
        <section className="grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => exportWorkbook(computed)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold">Exportar todo</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Todos los abonos y una segunda hoja de recepciones.</p>
          </button>
          <button type="button" onClick={() => exportWorkbook(sorted)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold">Exportar vista actual</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Respeta los filtros de Abonos / Seguimiento.</p>
          </button>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === 'danger' ? 'text-[var(--danger)]' : tone === 'warning' ? 'text-[var(--warning)]' : ''}`}>{value}</p>
    </div>
  );
}

function FilterSelect({ value, options, placeholder, onChange }: { value: string; options: string[]; placeholder: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function StatusPill({ row }: { row: AbonoComputed }) {
  if (!row.status) {
    return <span className="rounded-md bg-[var(--bg-soft)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)]">—</span>;
  }
  if (row.overdueDays !== null) {
    return <span className="inline-flex items-center gap-1 rounded-md bg-[var(--danger-soft)] px-2 py-1 text-[11px] font-medium text-[var(--danger)]"><AlertTriangle className="h-3 w-3" /> Vencido · {row.status}</span>;
  }
  if (row.reviewOverdue) {
    return <span className="rounded-md bg-[#f8eee4] px-2 py-1 text-[11px] font-medium text-[var(--warning)]">Revisar · {row.status}</span>;
  }
  if (row.status === 'Recibido') {
    return <span className="rounded-md bg-[var(--success-soft)] px-2 py-1 text-[11px] font-medium text-[var(--success)]">{row.status}</span>;
  }
  return <span className="rounded-md bg-[var(--bg-soft)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">{row.status}</span>;
}
