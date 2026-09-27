'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  AGENTES_TEMPLATE,
  COLECTIVOS_TEMPLATE,
  parseAgentesSheet,
  parseAlbaranesSheet,
  parseColectivosSheet,
  pickSheet,
} from '@/lib/albaranes-excel';
import {
  ALCANCE_ALBARANES,
  DEFAULT_SERIES,
  countRuleHits,
  currentActions,
  currentAlbaranes,
  currentIncidents,
  displayDash,
  exportPayload,
  formatIsoDate,
  formatIsoDateTime,
  formatEuro,
  formatInt,
  ingestCarga,
  knownEstados,
  knownSeries,
  latestCarga,
  newId,
  nextRuleId,
  nowIso,
  resumenKpis,
  todayIso,
  trendByBucket,
  STATE_EN_PROCESO,
  type Agent,
  type AlbaranesState,
  type Colectivo,
  type Evaluacion,
  type Regla,
} from '@/lib/albaranes-model';
import { loadAlbaranesState, saveAlbaranesState, type AlbaranesBackend } from '@/lib/albaranes-store';
import { Download, Plus, Search, Trash2 } from 'lucide-react';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'acciones', label: 'Bandeja' },
  { id: 'incidencias', label: 'Incidencias' },
  { id: 'reglas', label: 'Reglas' },
  { id: 'historico', label: 'Histórico' },
  { id: 'directorios', label: 'Directorios' },
  { id: 'comunicaciones', label: 'Correos' },
] as const;

type TabId = (typeof TABS)[number]['id'];

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function downloadAoa(sheets: Record<string, unknown[][]>, fileName: string) {
  void import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name, rows]) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
    });
    XLSX.writeFile(wb, fileName);
  });
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const shown = typeof value === 'number' ? formatInt(value) : value;
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums leading-tight">{shown}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

function Ack({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>
        <button type="button" onClick={onClose} className="mt-4 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white">
          Aceptar
        </button>
      </div>
    </div>
  );
}

export default function AlbaranesTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>('resumen');
  const [state, setState] = useState<AlbaranesState | null>(null);
  const [backend, setBackend] = useState<AlbaranesBackend>('local');
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const [ack, setAck] = useState<{ title: string; message: string } | null>(null);
  const [query, setQuery] = useState('');
  const [filterRule, setFilterRule] = useState('');
  const [filterSerie, setFilterSerie] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterResp, setFilterResp] = useState('');
  const [filterEnvio, setFilterEnvio] = useState('');
  const [filterNuevo, setFilterNuevo] = useState('');
  const [filterAge, setFilterAge] = useState('');
  const [vistaSerie, setVistaSerie] = useState('');
  const [vistaEstado, setVistaEstado] = useState('');
  const [vistaAgente, setVistaAgente] = useState('');
  const [trendEstado, setTrendEstado] = useState(STATE_EN_PROCESO);
  const [editingRule, setEditingRule] = useState<Regla | null>(null);
  const [dirTab, setDirTab] = useState<'agentes' | 'colectivos'>('agentes');

  const persist = useCallback(async (next: AlbaranesState, currentBackend: AlbaranesBackend) => {
    setState(next);
    setError(null);
    try {
      await saveAlbaranesState(next, currentBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAlbaranesState()
      .then((result) => {
        if (cancelled) return;
        setState(result.state);
        setBackend(result.backend);
        setSetupSql(result.setupSql || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar albaranes.');
      });
    return () => { cancelled = true; };
  }, []);

  const vistaFilters = useMemo(
    () => ({ serie: vistaSerie, estado: vistaEstado, agente: vistaAgente }),
    [vistaAgente, vistaEstado, vistaSerie],
  );
  const kpis = useMemo(() => (state ? resumenKpis(state, vistaFilters) : null), [state, vistaFilters]);
  const last = state ? latestCarga(state) : null;
  const actions = useMemo(() => (state ? currentActions(state) : []), [state]);
  const incidents = useMemo(() => (state ? currentIncidents(state) : []), [state]);
  const actuales = useMemo(() => (state ? currentAlbaranes(state) : []), [state]);
  const series = state ? knownSeries(state) : [...DEFAULT_SERIES];
  const estados = state ? knownEstados(state) : [];
  const agentesVista = useMemo(() => {
    const names = new Set<string>();
    actuales.forEach((row) => {
      const name = row.agente.trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [actuales]);

  const filteredActions = useMemo(() => {
    return actions.filter((row) => {
      if (filterRule && row.reglaId !== filterRule) return false;
      if (filterSerie && row.serie !== filterSerie) return false;
      if (filterEstado && row.estado !== filterEstado) return false;
      if (filterResp && row.agenteResuelto !== filterResp) return false;
      if (filterEnvio === 'enviado' && row.envio !== 'generado') return false;
      if (filterEnvio === 'no' && row.envio === 'generado') return false;
      if (filterNuevo === 'nuevo' && !row.nuevo) return false;
      if (filterNuevo === 'recurrente' && row.nuevo) return false;
      if (filterAge === '30' && row.diasEstado <= 30) return false;
      if (filterAge === '14' && row.diasEstado <= 14) return false;
      if (filterAge === '7' && row.diasEstado <= 7) return false;
      if (query) {
        const hay = `${row.albaran} ${row.agenteOriginal} ${row.agenteResuelto} ${row.codigoColectivo}`.toLocaleLowerCase('es');
        if (!hay.includes(query.toLocaleLowerCase('es'))) return false;
      }
      return true;
    });
  }, [actions, filterAge, filterEnvio, filterEstado, filterNuevo, filterResp, filterRule, filterSerie, query]);

  const ingestRows = async (rows: ReturnType<typeof parseAlbaranesSheet>, fileName: string, hash: string) => {
    if (!state) return;
    if (rows.length === 0) {
      setAck({ title: 'Archivo vacío', message: 'No he encontrado albaranes. Revisa que el Excel tenga columna Albarán.' });
      return;
    }
    const result = ingestCarga(state, {
      id: newId('carga'),
      loadedAt: nowIso(),
      loadDate: todayIso(),
      fileName,
      fileHash: hash || `${fileName}-${rows.length}`,
      rows,
    });
    if (result.duplicate) {
      setAck({
        title: 'Carga repetida',
        message: 'Este archivo ya se subió hoy. No he duplicado el histórico ni los correos.',
      });
      return;
    }
    await persist(result.state, backend);
      setAck({
        title: 'Carga guardada',
        message: `${formatInt(rows.length)} albaranes. ${formatInt(result.carga?.newBreaches || 0)} incumplimientos nuevos, ${formatInt(result.carga?.continuingBreaches || 0)} que continúan.`,
      });
    setTab('resumen');
  };

  const handleAlbaranesFile = async (data: unknown[][], fileName: string) => {
    const file = lastFileRef.current;
    const hash = file ? await sha256(file) : `${fileName}-${data.length}`;
    lastFileRef.current = null;
    const rows = parseAlbaranesSheet(data);
    await ingestRows(rows, fileName, hash);
  };

  const importDirectories = (sheets: Record<string, unknown[][]>) => {
    if (!state) return;
    const agentRows = pickSheet(sheets, ['agente']) || (Object.keys(sheets).length === 1 ? Object.values(sheets)[0] : null);
    const colectivoRows = pickSheet(sheets, ['colectivo']);
    const agents = parseAgentesSheet(agentRows || []);
    const colectivos = parseColectivosSheet(colectivoRows || []);
    if (agents.length === 0 && colectivos.length === 0) {
      setAck({ title: 'Sin directorio', message: 'Usa las hojas Agentes y Colectivos, o elige la plantilla.' });
      return;
    }
    const nextAgents = agents.length > 0 ? agents : state.agents;
    let nextColectivos = state.colectivos;
    if (colectivos.length > 0) {
      nextColectivos = colectivos.map((item) => {
        const byId = nextAgents.find((agent) => agent.id === item.idAgente);
        const byErp = nextAgents.find((agent) => agent.agenteErp.toLocaleLowerCase('es') === item.idAgente.toLocaleLowerCase('es'));
        return { ...item, idAgente: byId?.id || byErp?.id || item.idAgente };
      });
    }
    void persist({ ...state, agents: nextAgents, colectivos: nextColectivos }, backend);
    setAck({
      title: 'Directorio actualizado',
      message: `${nextAgents.length} agentes y ${nextColectivos.length} colectivos.`,
    });
  };

  const saveRule = (rule: Regla) => {
    if (!state) return;
    const exists = state.rules.some((item) => item.id === rule.id);
    const rules = exists
      ? state.rules.map((item) => (item.id === rule.id ? { ...rule, updatedAt: nowIso() } : item))
      : [...state.rules, { ...rule, createdAt: nowIso(), updatedAt: nowIso() }];
    void persist({ ...state, rules }, backend);
    setEditingRule(null);
  };

  const downloadExport = async () => {
    if (!state || !last) return;
    const payload = exportPayload(state, last);
    const response = await fetch('/api/albaranes-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, fileName: last.fileName.replace(/\.[^.]+$/, '') + '_acciones.xlsx' }),
    });
    if (!response.ok) {
      setAck({ title: 'No se ha podido exportar', message: 'Revisa que exceljs esté instalado y vuelve a generar el Excel.' });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `albaranes_acciones_${last.loadDate}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!state) {
    return <p className="p-6 text-sm text-[var(--text-secondary)]">Cargando control de albaranes…</p>;
  }

  return (
    <div className="space-y-4">
      <WorkspaceChrome onBack={onBack} tabs={[...TABS]} active={tab} onSelect={(id) => setTab(id as TabId)} />

      {setupSql && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Falta la tabla en Supabase. Pégalo en el SQL Editor:</p>
          <textarea readOnly className="mt-2 h-28 w-full rounded-md border border-amber-200 bg-white p-2 font-mono text-[11px]" value={setupSql} />
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {tab === 'resumen' && (
        <div className="space-y-4">
          <FileUpload
            inputId="albaranes-erp"
            label="Excel / CSV diario del ERP"
            hint="CSV del ERP con punto y coma. Misma estructura cada día."
            keepDropzone
            onRawFile={(file) => { lastFileRef.current = file; }}
            onFileLoaded={handleAlbaranesFile}
          />
          <p className="text-sm text-[var(--text-secondary)]">{ALCANCE_ALBARANES}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={vistaSerie} onChange={setVistaSerie} label="Serie" options={series.map((item) => [item, item])} />
            <Select value={vistaEstado} onChange={setVistaEstado} label="Estado" options={estados.map((item) => [item, item])} />
            {agentesVista.length > 0 && (
              <Select value={vistaAgente} onChange={setVistaAgente} label="Agente" options={agentesVista.map((item) => [item, item])} />
            )}
            {(vistaSerie || vistaEstado || vistaAgente) && (
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                onClick={() => {
                  setVistaSerie('');
                  setVistaEstado('');
                  setVistaAgente('');
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-6 gap-3">
            <Kpi label="Última carga" value={formatIsoDateTime(kpis?.lastLoadedAt || kpis?.lastLoadDate)} hint={kpis?.lastFileName || 'Aún no hay fichero'} />
            <Kpi label="Total albaranes" value={kpis?.activeCount || 0} hint={kpis?.totalImporte ? formatEuro(kpis.totalImporte) : undefined} />
            <Kpi label="Cumplen reglas" value={kpis?.actionCount || 0} />
            <Kpi label="Nº estados" value={kpis?.estadoCount || 0} />
            <Kpi label="Nº series" value={kpis?.serieCount || 0} />
            <Kpi label="Incidencias" value={kpis?.incidentCount || 0} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <HistoryTable title="Por estado" rows={(kpis?.estadoCounts || []).map((row) => [row.name, formatInt(row.count), formatEuro(row.importe)])} />
            <HistoryTable title="Por serie" rows={(kpis?.serieCounts || []).map((row) => [row.name, formatInt(row.count), formatEuro(row.importe)])} />
          </div>
        </div>
      )}

      {tab === 'acciones' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={query} onChange={setQuery} />
            <Select value={filterRule} onChange={setFilterRule} label="Regla" options={state.rules.map((rule) => [rule.id, rule.id])} />
            <Select value={filterSerie} onChange={setFilterSerie} label="Serie" options={series.map((item) => [item, item])} />
            <Select value={filterEstado} onChange={setFilterEstado} label="Estado" options={estados.map((item) => [item, item])} />
            <Select value={filterResp} onChange={setFilterResp} label="Responsable" options={Array.from(new Set(actions.map((row) => row.agenteResuelto))).map((item) => [item, item])} />
            <Select value={filterAge} onChange={setFilterAge} label="Antigüedad" options={[['7', '> 7 días'], ['14', '> 14 días'], ['30', '> 30 días']]} />
            <Select value={filterEnvio} onChange={setFilterEnvio} label="Envío" options={[['enviado', 'Enviado'], ['no', 'No enviado']]} />
            <Select value={filterNuevo} onChange={setFilterNuevo} label="Tipo" options={[['nuevo', 'Nuevo'], ['recurrente', 'Recurrente']]} />
            <button type="button" onClick={() => void downloadExport()} className="ml-auto flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-white">
              <Download className="h-3.5 w-3.5" /> Excel Power Automate
            </button>
          </div>
          <ActionTable rows={filteredActions} />
        </div>
      )}

      {tab === 'incidencias' && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                {['Albarán', 'Serie', 'Estado', 'Agente', 'Colectivo', 'Motivo', 'Qué hacer'].map((col) => (
                  <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 && (
                <tr><td className="px-3 py-6 text-[var(--text-muted)]" colSpan={7}>Sin incidencias de asignación.</td></tr>
              )}
              {incidents.map((row) => (
                <tr key={row.key} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">{row.albaran}</td>
                  <td className="px-3 py-2">{row.serie}</td>
                  <td className="px-3 py-2">{row.estado}</td>
                  <td className="px-3 py-2">{displayDash(row.agenteOriginal)}</td>
                  <td className="px-3 py-2">{displayDash(row.codigoColectivo)}</td>
                  <td className="px-3 py-2 text-[var(--danger)]">{row.assignmentReason}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{row.assignmentAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'reglas' && (
        <RulesPanel
          state={state}
          actuales={actuales}
          loadDate={last?.loadDate || todayIso()}
          editing={editingRule}
          onEdit={setEditingRule}
          onSave={saveRule}
          onToggle={(rule) => saveRule({ ...rule, activa: !rule.activa })}
        />
      )}

      {tab === 'historico' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Fotos guardadas" value={state.cargas.length} hint="Totales por estado y serie, sin albarán suelto" />
            <Kpi label="Albaranes última foto" value={last?.recordCount || 0} hint={last?.totalImporte ? formatEuro(last.totalImporte) : undefined} />
            <Kpi label="Antigüedad media" value={last?.averageAgeDays != null ? `${formatInt(last.averageAgeDays)} días` : '—'} />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Tendencia por estado</p>
              <select value={trendEstado} onChange={(e) => setTrendEstado(e.target.value)} className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs">
                {estados.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Así ves si En proceso (u otro estado) sube o baja a lo largo de los años.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    {['Fecha', 'Albaranes', 'Importe', 'Vs día anterior'].map((col) => (
                      <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...trendByBucket(state, 'estado', trendEstado)].reverse().map((row) => (
                    <tr key={row.loadDate} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">{formatIsoDate(row.loadDate)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatInt(row.count)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatEuro(row.importe)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.delta == null ? '—' : `${row.delta > 0 ? '+' : ''}${formatInt(row.delta)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {['Fecha', 'Archivo', 'Albaranes', 'Importe'].map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...state.cargas].reverse().map((carga) => (
                  <tr key={carga.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{formatIsoDate(carga.loadDate)}</td>
                    <td className="px-3 py-2">{carga.fileName}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(carga.recordCount)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatEuro(carga.totalImporte || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'directorios' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDirTab('agentes')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dirTab === 'agentes' ? 'bg-[var(--text-primary)] text-white' : 'border border-[var(--border)]'}`}>Agentes</button>
            <button type="button" onClick={() => setDirTab('colectivos')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dirTab === 'colectivos' ? 'bg-[var(--text-primary)] text-white' : 'border border-[var(--border)]'}`}>Colectivos</button>
            <button
              type="button"
              className="ml-auto rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
              onClick={() => downloadAoa({ Agentes: AGENTES_TEMPLATE, Colectivos: COLECTIVOS_TEMPLATE }, 'directorio_albaranes.xlsx')}
            >
              Descargar plantilla
            </button>
          </div>
          <FileUpload
            inputId="albaranes-dir"
            label="Excel maestro de responsables"
            hint="Hojas Agentes y Colectivos. Coincidencias exactas, sin adivinar códigos."
            keepDropzone
            onFileLoaded={() => {}}
            onWorkbookLoaded={(sheets) => importDirectories(sheets)}
          />
          {dirTab === 'agentes' ? (
            <AgentTable
              agents={state.agents}
              onChange={(agents) => void persist({ ...state, agents }, backend)}
            />
          ) : (
            <ColectivoTable
              colectivos={state.colectivos}
              agents={state.agents}
              onChange={(colectivos) => void persist({ ...state, colectivos }, backend)}
            />
          )}
        </div>
      )}

      {tab === 'comunicaciones' && (
        <div className="space-y-4">
          <button type="button" onClick={() => void downloadExport()} className="flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-white">
            <Download className="h-3.5 w-3.5" /> Generar Excel del día
          </button>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {['Fecha', 'Archivo', 'Destinatarios', 'Albaranes', 'A enviar', 'Omitidos', 'Incidencias'].map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...state.lots].reverse().map((lot) => (
                  <tr key={lot.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{formatIsoDate(lot.loadDate)}</td>
                    <td className="px-3 py-2">{lot.fileName}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.destinatarios)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.albaranes)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.enviados)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.omitidos)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.incidencias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {['Fecha', 'Responsable', 'Email', 'Albaranes', 'Enviar', 'Asunto'].map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...state.communications].reverse().slice(0, 80).map((item) => (
                  <tr key={`${item.clave}-${item.generatedAt}`} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{formatIsoDate(item.loadDate)}</td>
                    <td className="px-3 py-2">{item.agenteResuelto}</td>
                    <td className="px-3 py-2">{item.email}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(item.numeroAlbaranes)}</td>
                    <td className="px-3 py-2">{item.enviar ? 'Sí' : 'No'}</td>
                    <td className="px-3 py-2">{item.asunto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ack && <Ack title={ack.title} message={ack.message} onClose={() => setAck(null)} />}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs">
      <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar" className="w-36 bg-transparent outline-none" />
    </label>
  );
}

function Select({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs">
      <option value="">{label}</option>
      {options.filter((item) => item[0]).map(([id, name]) => (
        <option key={id} value={id}>{name}</option>
      ))}
    </select>
  );
}

function HistoryTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2 space-y-1 text-sm">
        {rows.length === 0 && <p className="text-[var(--text-muted)]">Sin datos de carga.</p>}
        {rows.map(([name, count, importe]) => (
          <div key={name} className="flex items-center justify-between gap-3">
            <span>{name}</span>
            <span className="tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
              {count}{importe ? ` (${importe})` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionTable({ rows }: { rows: Evaluacion[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-[var(--bg-soft)] uppercase tracking-wide text-[var(--text-muted)]">
          <tr>
            {['Regla', 'Id', 'Albarán', 'Serie', 'Estado', 'Fecha estado', 'Días', 'Agente', 'Colectivo', 'Resuelto', 'Email', '1ª fecha', 'Días incumple', 'Último aviso', 'Nº avisos', 'Envío'].map((col) => (
              <th key={col} className="whitespace-nowrap px-2 py-2 font-semibold">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="px-3 py-6 text-sm text-[var(--text-muted)]" colSpan={16}>Nadie cumple una regla activa con responsable válido.</td></tr>
          )}
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[var(--border)]">
              <td className="px-2 py-2">{row.reglaId}</td>
              <td className="px-2 py-2">{row.albaranId}</td>
              <td className="px-2 py-2 font-medium">{row.albaran}</td>
              <td className="px-2 py-2">{row.serie}</td>
              <td className="px-2 py-2">{row.estado}</td>
              <td className="px-2 py-2">{formatIsoDate(row.fechaEstado)}</td>
              <td className="px-2 py-2 tabular-nums">{row.diasEstado}</td>
              <td className="px-2 py-2">{displayDash(row.agenteOriginal)}</td>
              <td className="px-2 py-2">{displayDash(row.codigoColectivo)}</td>
              <td className="px-2 py-2">{row.agenteResuelto}</td>
              <td className="px-2 py-2">{row.email}</td>
              <td className="px-2 py-2">{formatIsoDate(row.primeraFechaIncumplimiento)}</td>
              <td className="px-2 py-2 tabular-nums">{row.diasIncumpliendo}</td>
              <td className="px-2 py-2">{formatIsoDate(row.ultimaNotificacion)}</td>
              <td className="px-2 py-2 tabular-nums">{row.numeroNotificaciones}</td>
              <td className="px-2 py-2">{row.envio === 'generado' ? 'Generado' : row.envio === 'omitido-duplicado' ? 'Ya enviado hoy' : row.envio}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesPanel({
  state,
  actuales,
  loadDate,
  editing,
  onEdit,
  onSave,
  onToggle,
}: {
  state: AlbaranesState;
  actuales: ReturnType<typeof currentAlbaranes>;
  loadDate: string;
  editing: Regla | null;
  onEdit: (rule: Regla | null) => void;
  onSave: (rule: Regla) => void;
  onToggle: (rule: Regla) => void;
}) {
  const draft = editing || {
    id: nextRuleId(state.rules),
    nombre: '',
    activa: false,
    series: [...DEFAULT_SERIES],
    estado: '',
    plazoDias: 5,
    metodo: 'agente-o-colectivo' as const,
    frecuencia: 'diaria' as const,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const preview = countRuleHits(draft, actuales, loadDate);
  const seriesOptions = knownSeries(state);
  const estadoOptions = knownEstados(state);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-2">
        {state.rules.map((rule) => (
          <div key={rule.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">{rule.id}</p>
                <p className="font-semibold">{rule.nombre}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {rule.series.join(', ')} · {rule.estado} · más de {rule.plazoDias} días
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Cumplirían ahora: {countRuleHits(rule, actuales, loadDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onToggle(rule)} className={`rounded-md px-2 py-1 text-xs font-semibold ${rule.activa ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--bg-soft)] text-[var(--text-muted)]'}`}>
                  {rule.activa ? 'Activa' : 'Inactiva'}
                </button>
                <button type="button" onClick={() => onEdit(rule)} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs">Editar</button>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onEdit({
            id: nextRuleId(state.rules),
            nombre: '',
            activa: false,
            series: [...DEFAULT_SERIES],
            estado: estadoOptions[0] || '',
            plazoDias: 5,
            metodo: 'agente-o-colectivo',
            frecuencia: 'diaria',
            createdAt: nowIso(),
            updatedAt: nowIso(),
          })}
          className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-sm"
        >
          <Plus className="h-4 w-4" /> Nueva regla
        </button>
      </div>
      {editing && (
      <form
        className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...draft, updatedAt: nowIso() });
        }}
      >
        <p className="font-semibold">{editing ? `Editar ${draft.id}` : `Nueva ${draft.id}`}</p>
        <label className="block text-xs">
          Nombre
          <input required value={draft.nombre} onChange={(e) => onEdit({ ...draft, nombre: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs">
          Estado
          <input list="albaranes-estados" required value={draft.estado} onChange={(e) => onEdit({ ...draft, estado: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          <datalist id="albaranes-estados">
            {estadoOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
        </label>
        <label className="block text-xs">
          Plazo en días
          <input type="number" min={1} required value={draft.plazoDias} onChange={(e) => onEdit({ ...draft, plazoDias: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </label>
        <fieldset className="text-xs">
          <legend className="mb-1">Series</legend>
          <div className="flex flex-wrap gap-2">
            {seriesOptions.map((serie) => {
              const on = draft.series.includes(serie);
              return (
                <button
                  key={serie}
                  type="button"
                  onClick={() => onEdit({ ...draft, series: on ? draft.series.filter((item) => item !== serie) : [...draft.series, serie] })}
                  className={`rounded-full border px-3 py-1 ${on ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white' : 'border-[var(--border)]'}`}
                >
                  {serie}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.activa} onChange={(e) => onEdit({ ...draft, activa: e.target.checked })} />
          Activa
        </label>
        <p className="text-sm text-[var(--text-secondary)]">Con la carga actual cumplirían esta regla <strong>{preview}</strong> albaranes, aunque esté inactiva.</p>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-semibold text-white">Guardar</button>
          <button type="button" onClick={() => onEdit(null)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cerrar</button>
        </div>
      </form>
      )}
    </div>
  );
}

function AgentTable({ agents, onChange }: { agents: Agent[]; onChange: (agents: Agent[]) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--bg-soft)] text-xs uppercase text-[var(--text-muted)]">
          <tr>
            {['Id', 'Agente ERP', 'Nombre', 'Email', 'Supervisor', 'Activo', ''].map((col) => <th key={col || 'x'} className="px-2 py-2">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, index) => (
            <tr key={agent.id} className="border-t border-[var(--border)]">
              <td className="px-2 py-1"><input value={agent.id} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, id: e.target.value } : item))} className="w-24 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.agenteErp} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, agenteErp: e.target.value } : item))} className="w-36 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.nombre} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, nombre: e.target.value } : item))} className="w-36 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.email} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, email: e.target.value } : item))} className="w-48 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.supervisor} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, supervisor: e.target.value } : item))} className="w-28 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input type="checkbox" checked={agent.activo} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, activo: e.target.checked } : item))} /></td>
              <td className="px-2 py-1"><button type="button" onClick={() => onChange(agents.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4 text-[var(--text-muted)]" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="m-3 flex items-center gap-2 text-sm"
        onClick={() => onChange([...agents, { id: newId('ag'), agenteErp: '', nombre: '', email: '', supervisor: '', activo: true }])}
      >
        <Plus className="h-4 w-4" /> Agente
      </button>
    </div>
  );
}

function ColectivoTable({ colectivos, agents, onChange }: { colectivos: Colectivo[]; agents: Agent[]; onChange: (rows: Colectivo[]) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--bg-soft)] text-xs uppercase text-[var(--text-muted)]">
          <tr>
            {['Código', 'Nombre', 'Responsable', 'Activo', ''].map((col) => <th key={col || 'x'} className="px-2 py-2">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {colectivos.map((row, index) => (
            <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="px-2 py-1"><input value={row.codigo} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, codigo: e.target.value } : item))} className="w-32 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={row.nombre} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, nombre: e.target.value } : item))} className="w-48 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1">
                <select value={row.idAgente} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, idAgente: e.target.value } : item))} className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                  <option value="">Elegir</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.nombre || agent.agenteErp}</option>)}
                </select>
              </td>
              <td className="px-2 py-1"><input type="checkbox" checked={row.activo} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, activo: e.target.checked } : item))} /></td>
              <td className="px-2 py-1"><button type="button" onClick={() => onChange(colectivos.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4 text-[var(--text-muted)]" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="m-3 flex items-center gap-2 text-sm"
        onClick={() => onChange([...colectivos, { id: newId('col'), codigo: '', nombre: '', idAgente: '', activo: true }])}
      >
        <Plus className="h-4 w-4" /> Colectivo
      </button>
    </div>
  );
}
