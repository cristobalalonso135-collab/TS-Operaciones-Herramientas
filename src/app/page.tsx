'use client';

import { useState, useCallback, useMemo } from 'react';
import FileUpload from '@/components/FileUpload';
import BudgetTable from '@/components/BudgetTable';
import NegativosForm from '@/components/NegativosForm';
import WeeklyWeightsForm from '@/components/WeeklyWeightsForm';
import {
  parseExcelData,
  processFullBudget,
  step1_aleatorioRestringido,
  step2_negativos,
  step3_ponderacionSemanal,
  MonthData,
  BudgetLineDaily,
  NegativosConfig,
  WeeklyWeightConfig,
  defaultNegativosConfig,
  defaultWeeklyWeightConfig,
  FISCAL_MONTHS_ORDER,
  getNegativosZonasForMonth,
} from '@/lib/budget-processor';
import { ArrowLeft, Calculator, Download, FileSpreadsheet, Lock, Shuffle, Table2, Unlock } from 'lucide-react';

const ALL_MONTHS = 'ALL';

const STEPS = [
  { id: 0, name: 'Distribucion diaria', description: 'Mensual a dias laborables' },
  { id: 1, name: 'Aleatorio +/-20%', description: 'Variacion diaria con total fijo' },
  { id: 2, name: 'Ponderacion semanal', description: 'Curva semanal antes de negativos' },
  { id: 3, name: 'Negativos', description: 'Ajustes finales por zona y primeros laborables' },
  { id: 4, name: 'Definitiva', description: 'Export final' },
];

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCurrency(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function getAllDates(data: MonthData[]): string[] {
  return data.flatMap((month) => month.lines[0]?.dias.map((day) => day.fecha) || []);
}

function formatDateHeader(dateValue: string): string {
  const date = new Date(dateValue);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function createAllMonthsData(data: MonthData[] | null): MonthData | null {
  if (!data || data.length === 0) return null;

  const allDates = getAllDates(data);
  const dayMeta = new Map<string, boolean>();
  const grouped = new Map<string, BudgetLineDaily>();

  data.forEach((month) => {
    month.lines[0]?.dias.forEach((day) => dayMeta.set(day.fecha, day.is_working));

    month.lines.forEach((line) => {
      const key = [line.area, line.vertical, line.medio_venta, line.pais, line.zona].join('|');
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          ...line,
          mes_fiscal: 'Todo FY',
          importe: line.importe,
          margen_bruto: line.margen_bruto,
          importe_diario: 0,
          dias_laborables: 0,
          dias: [],
          total_check: line.total_check,
        });
        return;
      }

      existing.importe += line.importe;
      existing.margen_bruto += line.margen_bruto;
      existing.total_check += line.total_check;
    });
  });

  const lines = Array.from(grouped.values()).map((line) => {
    const dayValues = new Map<string, { importe: number; margen: number }>();

    data.forEach((month) => {
      month.lines
        .filter((candidate) =>
          candidate.area === line.area &&
          candidate.vertical === line.vertical &&
          candidate.medio_venta === line.medio_venta &&
          candidate.pais === line.pais &&
          candidate.zona === line.zona
        )
        .forEach((candidate) => {
          candidate.dias.forEach((day) => {
            const current = dayValues.get(day.fecha) || { importe: 0, margen: 0 };
            current.importe += day.importe;
            current.margen += day.margen;
            dayValues.set(day.fecha, current);
          });
        });
    });

    const dias = allDates.map((date) => {
      const value = dayValues.get(date) || { importe: 0, margen: 0 };
      return {
        fecha: date,
        importe: value.importe,
        margen: value.margen,
        is_working: dayMeta.get(date) || false,
      };
    });
    const diasLaborables = dias.filter((day) => day.is_working).length;

    return {
      ...line,
      pct_margen: line.importe !== 0 ? line.margen_bruto / line.importe : 0,
      importe_diario: diasLaborables > 0 ? line.importe / diasLaborables : 0,
      dias_laborables: diasLaborables,
      dias,
      total_check: dias.reduce((sum, day) => sum + day.importe, 0),
    };
  });

  return {
    mes_fiscal: 'Todo FY',
    year: data[0].year,
    month: data[0].month,
    lines,
    total_importe: lines.reduce((sum, line) => sum + line.importe, 0),
    total_margen: lines.reduce((sum, line) => sum + line.margen_bruto, 0),
    dias_laborables: lines[0]?.dias_laborables || 0,
  };
}

function buildFySheetData(data: MonthData[], kind: 'facturacion' | 'cogs') {
  const allDates = getAllDates(data);
  const rows: any[][] = [];
  rows.push(['Mes Fiscal', 'Area', 'Vertical', 'Medio Venta', 'Pais', 'Zona', 'FY', 'Margen', '% Margen', ...allDates.map(formatDateHeader), 'Total Check']);

  data.forEach((month) => {
    month.lines.forEach((line) => {
      const isCogs = kind === 'cogs';
      const mensual = isCogs ? line.importe - line.margen_bruto : line.importe;
      const valuesByDate = new Map(
        line.dias.map((day) => [day.fecha, isCogs ? day.importe - day.margen : day.importe])
      );
      const dailyValues = allDates.map((date) => valuesByDate.get(date) || 0);
      const totalCheck = dailyValues.reduce((sum, value) => sum + value, 0);

      rows.push([
        month.mes_fiscal,
        line.area,
        line.vertical,
        line.medio_venta,
        line.pais,
        line.zona,
        mensual,
        line.margen_bruto,
        line.pct_margen,
        ...dailyValues,
        totalCheck,
      ]);
    });
  });

  return rows;
}

export default function Home() {
  const [view, setView] = useState<'tools' | 'budget'>('tools');
  const [currentStep, setCurrentStep] = useState(0);
  const [step0Data, setStep0Data] = useState<MonthData[] | null>(null);
  const [step1Data, setStep1Data] = useState<MonthData[] | null>(null);
  const [step2Data, setStep2Data] = useState<MonthData[] | null>(null);
  const [step3Data, setStep3Data] = useState<MonthData[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(FISCAL_MONTHS_ORDER[0]);
  const [totalLines, setTotalLines] = useState(0);
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [negativosConfig, setNegativosConfig] = useState<Record<string, NegativosConfig>>({});
  const [weeklyConfig, setWeeklyConfig] = useState<Record<string, WeeklyWeightConfig>>({});
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [weeklyMessage, setWeeklyMessage] = useState<string | null>(null);

  const handleFileLoaded = useCallback((data: any[][], _fileName: string) => {
    const parsed = parseExcelData(data);
    const processed = processFullBudget(parsed);
    const negConfig: Record<string, NegativosConfig> = {};
    const weekConfig: Record<string, WeeklyWeightConfig> = {};

    processed.forEach((month) => {
      const zonas = getNegativosZonasForMonth(month);
      negConfig[month.mes_fiscal] = defaultNegativosConfig(zonas.length > 0 ? zonas : undefined);
      weekConfig[month.mes_fiscal] = defaultWeeklyWeightConfig(month);
    });

    setTotalLines(parsed.length);
    setStep0Data(processed);
    setStep1Data(null);
    setStep2Data(null);
    setStep3Data(null);
    setClosedMonths([]);
    setNegativosConfig(negConfig);
    setWeeklyConfig(weekConfig);
    setApplyMessage(null);
    setWeeklyMessage(null);
    setCurrentStep(0);
    setSelectedMonth(processed.length > 0 ? processed[0].mes_fiscal : FISCAL_MONTHS_ORDER[0]);
  }, []);

  const handleGenerateStep1 = useCallback(() => {
    if (!step0Data) return;

    const generated = step1_aleatorioRestringido(step0Data);
    const result = generated.map((month) => {
      if (!closedMonths.includes(month.mes_fiscal)) return month;
      return step1Data?.find((locked) => locked.mes_fiscal === month.mes_fiscal) || month;
    });

    setStep1Data(result);
    setStep2Data(null);
    setStep3Data(null);
    setCurrentStep(1);
  }, [closedMonths, step0Data, step1Data]);

  const handleApplyNegativos = useCallback(() => {
    if (!step2Data) return;

    const applied = step2_negativos(step2Data, negativosConfig);
    const result = applied.map((month) => {
      if (!closedMonths.includes(month.mes_fiscal)) return month;
      return step3Data?.find((locked) => locked.mes_fiscal === month.mes_fiscal) || month;
    });

    setStep3Data(result);
    setCurrentStep(3);

    const beforeMonth = step2Data.find((month) => month.mes_fiscal === selectedMonth);
    const afterMonth = result.find((month) => month.mes_fiscal === selectedMonth);
    const changedLines = beforeMonth && afterMonth
      ? afterMonth.lines.filter((line, lineIndex) =>
          line.dias.some((day, dayIndex) => Math.abs(day.importe - (beforeMonth.lines[lineIndex]?.dias[dayIndex]?.importe || 0)) > 0.01)
        ).length
      : 0;

    setApplyMessage(
      changedLines > 0
        ? `Negativos aplicados en ${selectedMonth}: ${changedLines} lineas actualizadas.`
        : `No se han encontrado lineas Futbol Emotion + Equipaciones para las zonas de negativos en ${selectedMonth}.`
    );
    window.setTimeout(() => setApplyMessage(null), 4500);
  }, [closedMonths, negativosConfig, selectedMonth, step2Data, step3Data]);

  const handleUpdateNegConfig = useCallback((month: string, config: NegativosConfig) => {
    setNegativosConfig((prev) => ({ ...prev, [month]: config }));
  }, []);

  const handleUpdateWeeklyConfig = useCallback((month: string, config: WeeklyWeightConfig) => {
    setWeeklyConfig((prev) => ({ ...prev, [month]: config }));
  }, []);

  const handleApplyWeeklyWeights = useCallback(() => {
    if (!step1Data) return;

    const applied = step3_ponderacionSemanal(step1Data, weeklyConfig);
    const result = applied.map((month) => {
      if (!closedMonths.includes(month.mes_fiscal)) return month;
      return step2Data?.find((locked) => locked.mes_fiscal === month.mes_fiscal) || month;
    });

    setStep2Data(result);
    setStep3Data(null);
    setCurrentStep(2);
    setWeeklyMessage(`Ponderacion semanal aplicada en ${selectedMonth}.`);
    window.setTimeout(() => setWeeklyMessage(null), 4500);
  }, [closedMonths, selectedMonth, step1Data, step2Data, weeklyConfig]);

  const toggleClosedMonth = useCallback((month: string) => {
    if (month === ALL_MONTHS) return;
    setClosedMonths((prev) => (
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    ));
  }, []);

  const activeData = currentStep >= 3 && step3Data
    ? step3Data
    : currentStep >= 2 && step2Data
      ? step2Data
      : currentStep >= 1 && step1Data
      ? step1Data
      : step0Data;

  const allMonthsData = useMemo(() => createAllMonthsData(activeData), [activeData]);
  const currentMonthData = selectedMonth === ALL_MONTHS
    ? allMonthsData
    : activeData?.find((m) => m.mes_fiscal === selectedMonth);
  const totalBudget = activeData?.reduce((s, m) => s + m.total_importe, 0) || 0;
  const selectedMonthClosed = selectedMonth !== ALL_MONTHS && closedMonths.includes(selectedMonth);

  const stepAvailable = (id: number) => {
    if (id === 0) return !!step0Data;
    if (id === 1) return !!step1Data;
    if (id === 2) return !!step2Data || !!step1Data;
    if (id === 3) return !!step3Data || !!step2Data;
    if (id === 4) return !!step3Data;
    return false;
  };

  const handleExportFy = async (kind?: 'facturacion' | 'cogs') => {
    if (!activeData) return;

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    if (!kind || kind === 'facturacion') {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildFySheetData(activeData, 'facturacion')), 'Budget Facturacion');
    }
    if (!kind || kind === 'cogs') {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildFySheetData(activeData, 'cogs')), 'Budget COGS');
    }
    XLSX.writeFile(wb, kind === 'cogs' ? 'budget_COGS_FY_26_27.xlsx' : kind === 'facturacion' ? 'budget_facturacion_FY_26_27.xlsx' : 'budget_FY_26_27.xlsx');
  };

  if (view === 'tools') {
    return (
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Workspace</p>
          <h2 className="text-3xl font-semibold tracking-tight">Herramientas</h2>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() => setView('budget')}
            className="group min-h-[152px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
                <Calculator className="h-5 w-5" />
              </div>
              <span className="rounded-md bg-[var(--success-soft)] px-2 py-1 text-xs font-medium text-[var(--success)]">Activo</span>
            </div>
            <h3 className="text-base font-semibold">Budget</h3>
          </button>

          {['Forecast', 'Pedidos', 'Stock'].map((tool) => (
            <div key={tool} className="min-h-[152px] rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-5 text-left">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-[var(--bg-soft)] text-[var(--text-muted)]">
                <Table2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-[var(--text-secondary)]">{tool}</h3>
            </div>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => setView('tools')}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Herramientas
        </button>
        <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-1">
          {STEPS.map((step) => (
            <button
              key={step.id}
              onClick={() => stepAvailable(step.id) && setCurrentStep(step.id)}
              disabled={!stepAvailable(step.id) && step.id !== currentStep}
              className={`rounded px-3 py-1.5 text-xs transition ${
                step.id === currentStep
                  ? 'bg-[var(--text-primary)] text-white'
                  : stepAvailable(step.id)
                    ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
                    : 'text-[var(--text-muted)] opacity-50'
              }`}
            >
              {step.name}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Budget</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{STEPS[currentStep].name}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{STEPS[currentStep].description}</p>
          </div>
          {activeData && (
            <div className="flex gap-2">
              <button
                onClick={handleGenerateStep1}
                className="flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-medium text-white transition hover:bg-black"
              >
                <Shuffle className="h-3.5 w-3.5" />
                {step1Data ? 'Regenerar +/-20%' : 'Generar +/-20%'}
              </button>
              <button
                onClick={() => handleExportFy()}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium transition hover:bg-[var(--bg-soft)]"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar FY
              </button>
            </div>
          )}
        </div>

        {currentStep === 0 && (
          <div className="mt-5">
            <FileUpload onFileLoaded={handleFileLoaded} />
          </div>
        )}
      </section>

      {activeData && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Lineas</p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(totalLines)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Meses</p>
              <p className="mt-1 text-xl font-semibold">{activeData.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 md:col-span-2">
              <p className="text-xs text-[var(--text-secondary)]">Budget total</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(totalBudget)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedMonth(ALL_MONTHS)}
                className={`min-w-[120px] rounded-md border px-3 py-2 text-left text-xs transition ${
                  selectedMonth === ALL_MONTHS
                    ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
                }`}
              >
                <div className="font-medium">Todo FY</div>
                <div className="mt-0.5 opacity-70">{formatCurrency(totalBudget)}</div>
              </button>
              {activeData.map((md) => {
                const isClosed = closedMonths.includes(md.mes_fiscal);
                return (
                  <button
                    key={md.mes_fiscal}
                    onClick={() => setSelectedMonth(md.mes_fiscal)}
                    className={`min-w-[132px] rounded-md border px-3 py-2 text-left text-xs transition ${
                      md.mes_fiscal === selectedMonth
                        ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                        : isClosed
                          ? 'border-green-200 bg-[var(--success-soft)] text-[var(--success)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
                    }`}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      {isClosed && <Lock className="h-3 w-3" />}
                      {md.mes_fiscal}
                    </div>
                    <div className="mt-0.5 opacity-70">{formatCurrency(md.total_importe)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="text-sm text-[var(--text-secondary)]">
              {selectedMonth === ALL_MONTHS
                ? 'Vista acumulada: suma todos los meses con sus negativos aplicados.'
                : selectedMonthClosed
                  ? 'Mes cerrado: no se recalcula al regenerar ni al reaplicar negativos.'
                  : 'Mes abierto: se recalcula con los cambios.'}
            </div>
            {selectedMonth !== ALL_MONTHS && (
              <button
                onClick={() => toggleClosedMonth(selectedMonth)}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium transition hover:bg-[var(--bg-soft)]"
              >
                {selectedMonthClosed ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {selectedMonthClosed ? 'Reabrir mes' : 'Cerrar mes'}
              </button>
            )}
          </div>

          {step2Data && selectedMonth !== ALL_MONTHS && currentStep === 3 && negativosConfig[selectedMonth] && (
            <div className="space-y-3">
              {applyMessage && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${
                  applyMessage.startsWith('Negativos aplicados')
                    ? 'border-green-200 bg-[var(--success-soft)] text-[var(--success)]'
                    : 'border-amber-200 bg-amber-50 text-[var(--warning)]'
                }`}>
                  {applyMessage}
                </div>
              )}
              <NegativosForm
                selectedMonth={selectedMonth}
                config={negativosConfig[selectedMonth]}
                onChange={handleUpdateNegConfig}
                onApply={handleApplyNegativos}
              />
            </div>
          )}

          {step1Data && selectedMonth !== ALL_MONTHS && currentStep === 2 && weeklyConfig[selectedMonth] && currentMonthData && (
            <div className="space-y-3">
              {weeklyMessage && (
                <div className="rounded-lg border border-green-200 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
                  {weeklyMessage}
                </div>
              )}
              <WeeklyWeightsForm
                monthData={currentMonthData}
                config={weeklyConfig[selectedMonth]}
                onChange={handleUpdateWeeklyConfig}
                onApply={handleApplyWeeklyWeights}
              />
            </div>
          )}

          {activeData && currentStep === 4 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Definitiva</p>
                <h3 className="mt-1 text-lg font-semibold">Export final</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => handleExportFy('facturacion')}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-soft)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold">Budget Facturacion</span>
                  </div>
                  <Download className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
                <button
                  onClick={() => handleExportFy('cogs')}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-soft)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold">Budget COGS</span>
                  </div>
                  <Download className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
            </div>
          )}

          {currentMonthData && (
            <BudgetTable
              data={currentMonthData.lines}
              year={currentMonthData.year}
              month={currentMonthData.month}
              mesFiscal={currentMonthData.mes_fiscal}
            />
          )}
        </div>
      )}
    </div>
  );
}
