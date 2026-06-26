'use client';

import { useState, useCallback } from 'react';
import FileUpload from '@/components/FileUpload';
import BudgetTable from '@/components/BudgetTable';
import StepIndicator from '@/components/StepIndicator';
import {
  parseExcelData,
  processFullBudget,
  step1_aleatorioRestringido,
  MonthData,
  FISCAL_MONTHS_ORDER,
} from '@/lib/budget-processor';
import { Shuffle } from 'lucide-react';

const STEPS = [
  { id: 0, name: 'Distribución diaria', description: 'Mensual → días laborables' },
  { id: 1, name: 'Aleatorio ±20%', description: 'Variación con total fijo' },
  { id: 2, name: 'Negativos', description: 'Restar ajustes' },
  { id: 3, name: 'Definitiva', description: 'Budget final' },
];

function formatNum(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [step0Data, setStep0Data] = useState<MonthData[] | null>(null);
  const [step1Data, setStep1Data] = useState<MonthData[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(FISCAL_MONTHS_ORDER[0]);
  const [totalLines, setTotalLines] = useState(0);

  const handleFileLoaded = useCallback((data: any[][], _fileName: string) => {
    const parsed = parseExcelData(data);
    setTotalLines(parsed.length);
    const processed = processFullBudget(parsed);
    setStep0Data(processed);
    setStep1Data(null); // reset step 1
    setCurrentStep(0);
    if (processed.length > 0) {
      setSelectedMonth(processed[0].mes_fiscal);
    }
  }, []);

  const handleGenerateStep1 = useCallback(() => {
    if (!step0Data) return;
    const result = step1_aleatorioRestringido(step0Data);
    setStep1Data(result);
    setCurrentStep(1);
  }, [step0Data]);

  // Datos activos según el step seleccionado
  const activeData = currentStep === 1 && step1Data ? step1Data : step0Data;
  const currentMonthData = activeData?.find((m) => m.mes_fiscal === selectedMonth);
  const totalBudget = activeData?.reduce((s, m) => s + m.total_importe, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Step indicator clickable */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const isAvailable = step.id === 0 ? !!step0Data : step.id === 1 ? !!step1Data : false;
          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => isAvailable && setCurrentStep(step.id)}
                disabled={!isAvailable && step.id !== currentStep}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors
                  ${step.id === currentStep
                    ? 'bg-[var(--accent)] text-white'
                    : isAvailable
                      ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30 cursor-pointer hover:bg-[var(--success)]/20'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)]/50 border border-[var(--border)] cursor-not-allowed'
                  }`}
              >
                <span className="font-mono font-bold">{step.id}</span>
                <span>{step.name}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="w-4 h-px bg-[var(--border)] mx-1" />
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-6">
        {/* Step 0 header */}
        {currentStep === 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Step 0: Distribución por días laborables</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Sube el Excel de budget anual (FY 26/27). La app distribuye el importe mensual
              de cada línea entre los días laborables del mes (sin fines de semana ni festivos de Zaragoza).
            </p>
          </div>
        )}

        {/* Step 1 header */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Step 1: Aleatorio ±20%</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Cada día laborable varía ±20% sobre el promedio, pero el total mensual de cada línea
              se mantiene exacto. Pulsa "Regenerar" para obtener una nueva distribución.
            </p>
          </div>
        )}

        {/* File upload (solo en step 0) */}
        {currentStep === 0 && <FileUpload onFileLoaded={handleFileLoaded} />}

        {/* Datos cargados */}
        {activeData && (
          <div className="space-y-4">
            {/* Resumen + botones de acción */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                <span className="text-sm">
                  {totalLines} líneas · 12 meses · Budget total: {formatNum(totalBudget)} €
                </span>
              </div>

              <div className="flex gap-2">
                {/* Botón para generar/regenerar Step 1 */}
                {step0Data && (
                  <button
                    onClick={handleGenerateStep1}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded transition-colors"
                  >
                    <Shuffle className="w-4 h-4" />
                    {step1Data ? 'Regenerar ±20%' : 'Generar Aleatorio ±20%'}
                  </button>
                )}
              </div>
            </div>

            {/* Tabs de meses */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {activeData.map((md) => (
                <button
                  key={md.mes_fiscal}
                  onClick={() => setSelectedMonth(md.mes_fiscal)}
                  className={`px-3 py-1.5 text-xs rounded whitespace-nowrap transition-colors ${
                    md.mes_fiscal === selectedMonth
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
                  }`}
                >
                  <div className="font-medium">{md.mes_fiscal}</div>
                  <div className="text-[10px] opacity-70">
                    {md.dias_laborables}d · {formatNum(md.total_importe)}€
                  </div>
                </button>
              ))}
            </div>

            {/* Tabla */}
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
    </div>
  );
}
