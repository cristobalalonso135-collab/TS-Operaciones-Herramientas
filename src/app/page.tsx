'use client';

import { useState, useCallback, useMemo } from 'react';
import FileUpload from '@/components/FileUpload';
import BudgetTable from '@/components/BudgetTable';
import NegativosForm from '@/components/NegativosForm';
import WeeklyWeightsForm from '@/components/WeeklyWeightsForm';
import BudgetCompareTool from '@/components/BudgetCompareTool';
import BudgetFileValidatorTool from '@/components/BudgetFileValidatorTool';
import DailyBudgetMatchTool from '@/components/DailyBudgetMatchTool';
import DailyVariationTool from '@/components/DailyVariationTool';
import TrackingTool, { type TrackingViewMode } from '@/components/TrackingTool';
import OperationsDashboard from '@/components/OperationsDashboard';
import StockTool from '@/components/StockTool';
import WorkspaceChrome from '@/components/WorkspaceChrome';
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
import { Download, FileSpreadsheet, Lock, Shuffle, Unlock } from 'lucide-react';

const ALL_MONTHS = 'ALL';

const BUDGET_TABS = [
  { id: 'generate', label: 'Diario' },
  { id: 'compare', label: 'Comparador' },
  { id: 'validator', label: 'Validador' },
  { id: 'match', label: 'Cuadre' },
  { id: 'variation', label: 'Suavidad' },
] as const;

type BudgetTabId = (typeof BUDGET_TABS)[number]['id'];

const STEPS = [
  { id: 0, name: 'Distribución diaria', description: 'Mensual a días laborables' },
  { id: 1, name: 'Aleatorio +/-20%', description: 'Variación diaria con total fijo' },
  { id: 2, name: 'Ponderación semanal', description: 'Curva semanal antes de negativos' },
  { id: 3, name: 'Negativos', description: 'Ajustes finales por zona y primeros laborables' },
  { id: 4, name: 'Definitiva', description: 'Histórico completado' },
];

interface HistoricalWorkbook {
  fileName: string;
  sheets: Record<string, any[][]>;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCurrency(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatPercent(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
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

function normalizeDateHeaderValue(value: any): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  }

  if (typeof value === 'number' && value > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  const text = String(value || '').trim();
  if (!text) return null;

  const spanish = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (spanish) {
    return `${spanish[1].padStart(2, '0')}/${spanish[2].padStart(2, '0')}/${spanish[3]}`;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }

  return null;
}

function normalizeMatchPart(value: any): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim().toLowerCase();
}

const EXPORT_VERTICAL_ID_BY_NAME: Record<string, string> = {
  'fútbol emotion': '1',
  'futbol emotion': '1',
  'football emotion': '1',
  'basketball emotion': '2',
  'the pitch': '6',
  'running emotion': '7',
  'ekinsports.com': '7',
  'rcd mallorca': '101',
  'sd huesca': '102',
  'nàstic de tarragona': '103',
  'nastic de tarragona': '103',
  'real zaragoza': '104',
  'real federación andaluza de fútbol': '105',
  'real federacion andaluza de futbol': '105',
  'real club deportivo a coruña': '106',
  'real club deportivo a coruna': '106',
  'kings league españa': '1001',
  'kings league espana': '1001',
  'kings league italia': '1002',
  'kings league francia': '1003',
  'kings league alemania': '1004',
};

function getExportVerticalId(line: BudgetLineDaily): string {
  const id = String(line.id_vertical || '').trim();
  if (id) return id;
  return EXPORT_VERTICAL_ID_BY_NAME[normalizeMatchPart(line.vertical)] || String(line.vertical || '').trim();
}

function formatZonaForMatch(zona: string): string {
  const cleanZona = String(zona || '').trim();
  if (!cleanZona) return '\u00a0';
  return cleanZona.toLowerCase().startsWith('zona ') ? cleanZona : `Zona ${cleanZona}`;
}

function getExportIndexKey(line: BudgetLineDaily): string {
  return [
    getExportVerticalId(line),
    line.medio_venta,
    formatZonaForMatch(line.zona),
    line.cod_mercado || line.pais,
  ].join('|');
}

function getWideRowKey(row: any[], indexes: Record<string, number>): string {
  return [
    row[indexes.idVertical],
    row[indexes.nombre],
    row[indexes.zona],
    row[indexes.codMercado],
  ].map(normalizeMatchPart).join('|');
}

function findWideHeaderIndex(rows: any[][]): number {
  return rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeMatchPart(cell));
    return (
      normalized.includes('id_vertical') &&
      normalized.includes('nombre') &&
      normalized.includes('zona_equipaciones') &&
      normalized.includes('cod_mercado')
    );
  });
}

function mergeWideSheet(historyRows: any[][] | undefined, generatedRows: any[][]): any[][] {
  if (!historyRows || historyRows.length === 0) return generatedRows;

  const headerIdx = findWideHeaderIndex(historyRows);
  if (headerIdx < 0) return historyRows;

  const rows = historyRows.map((row) => [...row]);
  const header = rows[headerIdx];
  const normalizedHeader = header.map((cell) => normalizeMatchPart(cell));
  const historyIndexes = {
    idVertical: normalizedHeader.indexOf('id_vertical'),
    nombre: normalizedHeader.indexOf('nombre'),
    zona: normalizedHeader.indexOf('zona_equipaciones'),
    codMercado: normalizedHeader.indexOf('cod_mercado'),
  };
  const generatedHeader = generatedRows[0] || [];
  const generatedDates = generatedHeader.slice(4).map(normalizeDateHeaderValue);
  const dateColumnByKey = new Map<string, number>();
  const newDateKeys = new Set<string>();

  header.forEach((cell, index) => {
    const key = normalizeDateHeaderValue(cell);
    if (key) dateColumnByKey.set(key, index);
  });

  generatedDates.forEach((dateKey, generatedIndex) => {
    if (!dateKey || dateColumnByKey.has(dateKey)) return;
    const newIndex = header.length;
    header.push(generatedHeader[generatedIndex + 4]);
    dateColumnByKey.set(dateKey, newIndex);
    newDateKeys.add(dateKey);
  });

  const rowByKey = new Map<string, any[]>();
  rows.slice(headerIdx + 1).forEach((row) => {
    const key = getWideRowKey(row, historyIndexes);
    if (key.replace(/\|/g, '')) rowByKey.set(key, row);
  });

  generatedRows.slice(1).forEach((generatedRow) => {
    const generatedKey = generatedRow.slice(0, 4).map(normalizeMatchPart).join('|');
    let targetRow = rowByKey.get(generatedKey);

    if (!targetRow) {
      targetRow = Array(header.length).fill(null);
      targetRow[historyIndexes.idVertical] = generatedRow[0];
      targetRow[historyIndexes.nombre] = generatedRow[1];
      targetRow[historyIndexes.zona] = generatedRow[2];
      targetRow[historyIndexes.codMercado] = generatedRow[3];
      rows.push(targetRow);
      rowByKey.set(generatedKey, targetRow);
    }

    generatedDates.forEach((dateKey, generatedIndex) => {
      if (!dateKey) return;
      if (!newDateKeys.has(dateKey)) return;
      const targetColumn = dateColumnByKey.get(dateKey);
      if (targetColumn === undefined) return;
      const generatedValue = generatedRow[generatedIndex + 4];
      if (generatedValue !== null && generatedValue !== undefined && generatedValue !== '') {
        targetRow[targetColumn] = generatedValue;
      }
    });
  });

  return rows;
}

function findSheetRows(sheets: Record<string, any[][]>, preferred: string): any[][] | undefined {
  const exact = sheets[preferred];
  if (exact) return exact;

  const foundName = Object.keys(sheets).find((name) => normalizeMatchPart(name) === normalizeMatchPart(preferred));
  if (foundName) return sheets[foundName];

  if (normalizeMatchPart(preferred) === 'cogs') {
    const cogsName = Object.keys(sheets).find((name) => normalizeMatchPart(name).includes('cogs'));
    if (cogsName) return sheets[cogsName];
  }

  const wideSheetName = Object.keys(sheets).find((name) => {
    if (normalizeMatchPart(preferred) !== 'cogs' && normalizeMatchPart(name).includes('cogs')) return false;
    return findWideHeaderIndex(sheets[name]) >= 0;
  });

  return wideSheetName ? sheets[wideSheetName] : undefined;
}

function createAllMonthsData(data: MonthData[] | null): MonthData | null {
  if (!data || data.length === 0) return null;

  const allDates = getAllDates(data);
  const dayMeta = new Map<string, boolean>();
  const grouped = new Map<string, BudgetLineDaily>();

  data.forEach((month) => {
    month.lines[0]?.dias.forEach((day) => dayMeta.set(day.fecha, day.is_working));

    month.lines.forEach((line) => {
      const key = [line.area, line.id_vertical, line.vertical, line.medio_venta, line.pais, line.cod_mercado, line.zona].join('|');
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
          candidate.id_vertical === line.id_vertical &&
          candidate.vertical === line.vertical &&
          candidate.medio_venta === line.medio_venta &&
          candidate.pais === line.pais &&
          candidate.cod_mercado === line.cod_mercado &&
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
  const rowsByKey = new Map<string, {
    idVertical: string;
    nombre: string;
    zona: string;
    codMercado: string;
    valuesByDate: Map<string, number>;
  }>();

  data.forEach((month) => {
    month.lines.forEach((line) => {
      const isCogs = kind === 'cogs';
      const key = getExportIndexKey(line);
      const existing = rowsByKey.get(key);
      const row = existing || {
        idVertical: getExportVerticalId(line),
        nombre: line.medio_venta,
        zona: formatZonaForMatch(line.zona),
        codMercado: line.cod_mercado || line.pais,
        valuesByDate: new Map<string, number>(),
      };
      const marginRate = line.importe !== 0 ? line.margen_bruto / line.importe : 0;

      if (line.importe_is_blank) {
        if (!existing) rowsByKey.set(key, row);
        return;
      }

      line.dias.forEach((day) => {
        if (!day.is_working && day.importe === 0) return;
        const value = isCogs ? day.importe * (1 - marginRate) : day.importe;
        row.valuesByDate.set(day.fecha, (row.valuesByDate.get(day.fecha) || 0) + value);
      });

      if (!existing) rowsByKey.set(key, row);
    });
  });

  return [
    ['id_vertical', 'nombre', 'zona_equipaciones', 'cod_mercado', ...allDates.map(formatDateHeader)],
    ...Array.from(rowsByKey.values()).map((row) => [
      row.idVertical,
      row.nombre,
      row.zona,
      row.codMercado,
      ...allDates.map((date) => row.valuesByDate.has(date) ? row.valuesByDate.get(date) : null),
    ]),
  ];
}

export default function Home() {
  const [view, setView] = useState<'tools' | 'dashboard' | 'budget' | 'tracking' | 'stock'>('tools');
  const [budgetTab, setBudgetTab] = useState<BudgetTabId>('generate');
  const [trackingView, setTrackingView] = useState<TrackingViewMode>('ytd');
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
  const [weeklyAppliedMonths, setWeeklyAppliedMonths] = useState<string[]>([]);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [weeklyMessage, setWeeklyMessage] = useState<string | null>(null);
  const [historicalWorkbook, setHistoricalWorkbook] = useState<HistoricalWorkbook | null>(null);

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
    setWeeklyAppliedMonths([]);
    setApplyMessage(null);
    setWeeklyMessage(null);
    setHistoricalWorkbook(null);
    setCurrentStep(0);
    setSelectedMonth(processed.length > 0 ? processed[0].mes_fiscal : FISCAL_MONTHS_ORDER[0]);
  }, []);

  const handleHistoricalWorkbookLoaded = useCallback((sheets: Record<string, any[][]>, fileName: string) => {
    const shouldContinue = window.confirm(
      'Recuerda: el histórico completado conserva lo que ya exista y solo rellena fechas que no estén en el archivo. Si quieres recalcular desde una fecha concreta, borra antes en el histórico las columnas desde ese primer día; si las dejas, la app no las pisará.'
    );
    if (!shouldContinue) return;

    setHistoricalWorkbook({ sheets, fileName });
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
    setWeeklyAppliedMonths([]);
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
    const selectedConfig = negativosConfig[selectedMonth];
    const totalNegativo = selectedConfig
      ? selectedConfig.zonas.reduce((sum, zona) => (
          sum + zona.web_b2c_anterior * (zona.pct_gen_web / 100) + zona.grassroots * (zona.pct_frees / 100)
        ), 0)
      : 0;
    const changedLines = beforeMonth && afterMonth
      ? afterMonth.lines.filter((line, lineIndex) =>
          line.dias.some((day, dayIndex) => Math.abs(day.importe - (beforeMonth.lines[lineIndex]?.dias[dayIndex]?.importe || 0)) > 0.01)
        ).length
      : 0;

    setApplyMessage(
      changedLines > 0
        ? `Negativos aplicados en ${selectedMonth}: ${changedLines} líneas actualizadas.`
        : Math.abs(totalNegativo) < 0.01
          ? `Negativos aplicados en ${selectedMonth}: total 0, sin cambios en importes.`
        : `No se han encontrado líneas Fútbol Emotion + Equipaciones para las zonas de negativos en ${selectedMonth}.`
    );
    window.setTimeout(() => setApplyMessage(null), 4500);
  }, [closedMonths, negativosConfig, selectedMonth, step2Data, step3Data]);

  const handleUpdateNegConfig = useCallback((month: string, config: NegativosConfig) => {
    setNegativosConfig((prev) => ({ ...prev, [month]: config }));
  }, []);

  const handleUpdateWeeklyConfig = useCallback((month: string, config: WeeklyWeightConfig) => {
    setWeeklyConfig((prev) => ({ ...prev, [month]: config }));
    setWeeklyAppliedMonths((prev) => prev.filter((appliedMonth) => appliedMonth !== month));
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
    setWeeklyAppliedMonths((prev) => (
      prev.includes(selectedMonth) ? prev : [...prev, selectedMonth]
    ));
    setCurrentStep(2);
    setWeeklyMessage(`Ponderación semanal aplicada en ${selectedMonth}.`);
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
  const weeklyBaseMonthData = selectedMonth === ALL_MONTHS
    ? null
    : step1Data?.find((m) => m.mes_fiscal === selectedMonth);
  const totalBudget = activeData?.reduce((s, m) => s + m.total_importe, 0) || 0;
  const totalMargen = activeData?.reduce((s, m) => s + m.total_margen, 0) || 0;
  const totalCogs = totalBudget - totalMargen;
  const totalMargenPct = totalBudget !== 0 ? (totalMargen / totalBudget) * 100 : 0;
  const uniqueDays = new Map<string, boolean>();
  activeData?.forEach((month) => month.lines[0]?.dias.forEach((day) => uniqueDays.set(day.fecha, day.is_working)));
  const totalDiasLaborables = Array.from(uniqueDays.values()).filter(Boolean).length;
  const totalDiasNoLaborables = Array.from(uniqueDays.values()).filter((isWorking) => !isWorking).length;
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
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildFySheetData(activeData, 'facturacion')), 'Hoja1');
    }
    if (!kind || kind === 'cogs') {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildFySheetData(activeData, 'cogs')), 'COGS');
    }
    XLSX.writeFile(wb, kind === 'cogs' ? 'budget_COGS_FY_26_27.xlsx' : kind === 'facturacion' ? 'budget_facturacion_FY_26_27.xlsx' : 'budget_FY_26_27.xlsx');
  };

  const handleExportMergedHistorical = async () => {
    if (!activeData || !historicalWorkbook) return;

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const facturacionRows = mergeWideSheet(
      findSheetRows(historicalWorkbook.sheets, 'Hoja1'),
      buildFySheetData(activeData, 'facturacion')
    );
    const cogsRows = mergeWideSheet(
      findSheetRows(historicalWorkbook.sheets, 'COGS'),
      buildFySheetData(activeData, 'cogs')
    );

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(facturacionRows), 'Hoja1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cogsRows), 'COGS');
    XLSX.writeFile(wb, `budget_historico_completado_${historicalWorkbook.fileName.replace(/\.[^.]+$/, '')}.xlsx`);
    window.alert('Recuerda sustituir los valores de las tiendas de Pro Clubs (mes siguiente) y Francia online (hasta final de FY).');
  };

  if (view === 'dashboard') {
    return (
      <OperationsDashboard
        onBack={() => setView('tools')}
        onOpenBudget={() => {
          setBudgetTab('compare');
          setView('budget');
        }}
        onOpenTracking={(next) => {
          setTrackingView(next);
          setView('tracking');
        }}
      />
    );
  }

  if (view === 'tracking') {
    return (
      <TrackingTool
        onBack={() => setView('tools')}
        initialView={trackingView}
      />
    );
  }

  if (view === 'stock') {
    return <StockTool onBack={() => setView('tools')} />;
  }

  if (view === 'tools') {
    const hubs = [
      {
        id: 'dashboard' as const,
        number: '01',
        title: 'Cuadro de mando',
        description: 'Plan vs LY, facturación, GM, margen, frees, generados y deuda. Pincha un recuadro y saltas a Budget o Seguimiento.',
        detail: 'Budget vs LY · facturación · GM · margen · frees · generados · deuda',
        tone: 'bg-[var(--text-primary)] text-[var(--bg-card)]',
      },
      {
        id: 'budget' as const,
        number: '02',
        title: 'Budget',
        description: 'Generar el diario, cuadrarlo, validarlo y mirar la curva. Todo en pestañas.',
        detail: 'Diario · Comparador · Validador · Cuadre · Suavidad',
        tone: 'bg-[var(--accent-soft)] text-[var(--accent)]',
      },
      {
        id: 'tracking' as const,
        number: '03',
        title: 'Seguimiento',
        description: 'Facturación vs budget, margen, frees, generados y deuda.',
        detail: 'YTD · Meses · Frees · Generados · Deuda',
        tone: 'bg-[var(--success-soft)] text-[var(--success)]',
      },
      {
        id: 'stock' as const,
        number: '04',
        title: 'Stock',
        description: 'Dinero inmovilizado en Equipaciones. A extinguir, temporadas viejas y fotos semanales.',
        detail: 'Resumen · Riesgo · Tendencia',
        tone: 'bg-[var(--kpi-debt-soft)] text-[var(--kpi-debt)]',
      },
    ];

    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <section className="tools-rise relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/90 px-6 py-8 shadow-sm sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--accent-soft)] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-[var(--success-soft)] blur-2xl" />
          <div className="relative max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              TS Operaciones
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">
              Herramientas
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[var(--text-secondary)]">
              Tres entradas comerciales y una de almacén. El resto vive en pestañas dentro de cada herramienta.
            </p>
          </div>
        </section>

        <section className="grid gap-3">
          {hubs.map((hub) => (
            <button
              key={hub.id}
              type="button"
              onClick={() => {
                if (hub.id === 'budget') setBudgetTab('generate');
                if (hub.id === 'tracking') setTrackingView('ytd');
                setView(hub.id);
              }}
              className="tools-rise group flex w-full items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-white sm:p-6"
            >
              <div className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${hub.tone}`}>
                <span className="font-display text-base font-semibold leading-none">{hub.number}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-display text-lg font-semibold tracking-tight">{hub.title}</h4>
                  <span className="rounded-md bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    {hub.detail}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{hub.description}</p>
              </div>
              <span className="mt-1 hidden shrink-0 text-sm font-medium text-[var(--accent)] transition group-hover:translate-x-0.5 sm:inline">
                Abrir →
              </span>
            </button>
          ))}
        </section>

        <p className="text-center text-xs text-[var(--text-muted)]">
          El cuadro de mando lee el plan en Budget y el año en Seguimiento. Todavía es maqueta: los recuadros ya saltan a la herramienta.
        </p>
      </div>
    );
  }

  const goHome = () => setView('tools');
  const budgetChrome = (
    <WorkspaceChrome
      onBack={goHome}
      tabs={[...BUDGET_TABS]}
      active={budgetTab}
      onSelect={(id) => setBudgetTab(id as BudgetTabId)}
    />
  );

  if (budgetTab === 'compare') {
    return (
      <div className="space-y-4">
        {budgetChrome}
        <BudgetCompareTool hideBack onBack={goHome} />
      </div>
    );
  }
  if (budgetTab === 'validator') {
    return (
      <div className="space-y-4">
        {budgetChrome}
        <BudgetFileValidatorTool hideBack onBack={goHome} />
      </div>
    );
  }
  if (budgetTab === 'match') {
    return (
      <div className="space-y-4">
        {budgetChrome}
        <DailyBudgetMatchTool hideBack onBack={goHome} />
      </div>
    );
  }
  if (budgetTab === 'variation') {
    return (
      <div className="space-y-4">
        {budgetChrome}
        <DailyVariationTool hideBack onBack={goHome} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {budgetChrome}
      <div className="flex items-center justify-end gap-4">
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
          {activeData && currentStep !== 4 && (
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
          {currentStep !== 4 && (
            <>
          <div className="grid gap-3 md:grid-cols-8">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Budget</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(totalBudget)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">COGS</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(totalCogs)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Margen bruto</p>
              <p className={`mt-1 text-xl font-semibold ${totalMargen >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {formatCurrency(totalMargen)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Margen %</p>
              <p className={`mt-1 text-xl font-semibold ${totalMargenPct >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {formatPercent(totalMargenPct)}
              </p>
            </div>
            <div className="rounded-lg border-l-2 border-l-[var(--border-strong)] border-y border-r border-y-[var(--border)] border-r-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Lineas</p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(totalLines)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Meses</p>
              <p className="mt-1 text-xl font-semibold">{activeData.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Días laborables</p>
              <p className="mt-1 text-xl font-semibold">{totalDiasLaborables}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Dias no laborables</p>
              <p className="mt-1 text-xl font-semibold">{totalDiasNoLaborables}</p>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div
              className="grid gap-2 overflow-x-auto md:overflow-visible"
              style={{ gridTemplateColumns: `repeat(${activeData.length + 1}, minmax(0, 1fr))` }}
            >
              <button
                onClick={() => setSelectedMonth(ALL_MONTHS)}
                className={`min-w-0 rounded-md border px-2 py-2 text-left text-[11px] transition ${
                  selectedMonth === ALL_MONTHS
                    ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
                }`}
              >
                <div className="truncate font-medium">Todo FY</div>
                <div className="mt-0.5 truncate text-[10px] opacity-70">{formatCurrency(totalBudget)}</div>
              </button>
              {activeData.map((md) => {
                const isClosed = closedMonths.includes(md.mes_fiscal);
                return (
                  <button
                    key={md.mes_fiscal}
                    onClick={() => setSelectedMonth(md.mes_fiscal)}
                    className={`min-w-0 rounded-md border px-2 py-2 text-left text-[11px] transition ${
                      md.mes_fiscal === selectedMonth
                        ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                        : isClosed
                          ? 'border-green-200 bg-[var(--success-soft)] text-[var(--success)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
                    }`}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      {isClosed && <Lock className="h-3 w-3" />}
                      <span className="truncate">{md.mes_fiscal}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] opacity-70">{formatCurrency(md.total_importe)}</div>
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

          {step1Data && selectedMonth !== ALL_MONTHS && currentStep === 2 && weeklyConfig[selectedMonth] && weeklyBaseMonthData && (
            <div className="space-y-3">
              {weeklyMessage && (
                <div className="rounded-lg border border-green-200 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
                  {weeklyMessage}
                </div>
              )}
              <WeeklyWeightsForm
                monthData={weeklyBaseMonthData}
                config={weeklyConfig[selectedMonth]}
                isApplied={weeklyAppliedMonths.includes(selectedMonth)}
                onChange={handleUpdateWeeklyConfig}
                onApply={handleApplyWeeklyWeights}
              />
            </div>
          )}
            </>
          )}

          {activeData && currentStep === 4 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Definitiva</p>
                <h3 className="mt-1 text-lg font-semibold">Histórico para completar</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Sube el histórico actual y descarga el archivo completado. La app conserva fechas existentes y solo añade lo que no esté.
                </p>
              </div>
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Antes de subir el histórico, revisa si has borrado las columnas desde el primer día que quieres cambiar. Si una fecha ya existe en el histórico, se mantiene y no se recalcula.
              </div>
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <FileUpload
                  inputId="historical-file-input"
                  label="Histórico para completar"
                  onFileLoaded={() => {}}
                  onWorkbookLoaded={handleHistoricalWorkbookLoaded}
                />
                <button
                  onClick={handleExportMergedHistorical}
                  disabled={!historicalWorkbook}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--success-soft)] text-[var(--success)]">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold">Descargar histórico completado</span>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        Mantiene lo existente y rellena solo filas o fechas que no existan.
                      </p>
                    </div>
                  </div>
                  <Download className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
            </div>
          )}

          {currentMonthData && currentStep !== 4 && (
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
