'use client';

import { useState, useCallback } from 'react';
import FileUpload from '@/components/FileUpload';
import BudgetTable from '@/components/BudgetTable';
import NegativosForm from '@/components/NegativosForm';
import {
  parseExcelData,
  processFullBudget,
  step1_aleatorioRestringido,
  step2_negativos,
  MonthData,
  NegativosConfig,
  defaultNegativosConfig,
  FISCAL_MONTHS_ORDER,
} from '@/lib/budget-processor';
import { Shuffle, Minus } from 'lucide-react';

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
  const [step2Data, setStep2Data] = useState<MonthData[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(FISCAL_MONTHS_ORDER[0]);
  const [totalLines, setTotalLines] = useState(0);

  // Negativos config por mes
  const [negativosConfig, setNegativosConfig] = useState<Record<string, NegativosConfig>>({});

  const handleFileLoaded = useCallback((data: any[][], _fileName: string) => {
    const parsed = parseExcelData(data);
    setTotalLines(parsed.length);
    const processed = processFullBudget(parsed);
    setStep0Data(processed);
    setStep1Data(null);
    setStep2Data(null);
    setCurrentStep(0);
    // Inicializar config de negativos para cada mes
    const negConfig: Record<string, NegativosConfig> = {};
    for (const m of FISCAL_MONTHS_ORDER) {
      negConfig[m] = defaultNegativosConfig();
    }
    setNegativosConfig(negConfig);
    if (processed.length > 0) {
      setSelectedMonth(processed[0].mes_fiscal);
    }
  }, []);

  const handleGenerateStep1 = useCallback(() => {
    if (!step0Data) return;
    const result = step1_aleatorioRestringido(step0Data);
    setStep1Data(result);
    setStep2Data(null);
    setCurrentStep(1);
  }, [step0Data]);

  const handleApplyNegativos = useCallback(() => {
    if (!step1Data) return;
    const result = step2_negativos(step1Data, negativosConfig);
    setStep2Data(result);
    setCurrentStep(2);
  }, [step1Data, negativosConfig]);

  const handleUpdateNegConfig = useCallback((month: string, config: NegativosConfig) => {
    setNegativosConfig((prev) => ({ ...prev, [month]: config }));
  }, []);

  // Datos activos según step
  const activeData = currentStep === 2 && step2Data
    ? step2Data
    : currentStep === 1 && step1Data
      ? step1Data
      : step0Data;

  const currentMonthData = activeData?.find((m) => m.mes_fiscal === selectedMonth);
  const totalBudget = activeData?.reduce((s, m) => s + m.total_importe, 0) || 0;

  const stepAvailable = (id: number) => {
    if (id === 0) return !!step0Data;
    if (id === 1) return !!step1Data;
    if (id === 2) return !!step2Data;
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => stepAvailable(step.id) && setCurrentStep(step.id)}
              disabled={!stepAvailable(step.id) && step.id !== currentStep}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors
                ${step.id === currentStep
                  ? 'bg-[var(--accent)] text-white'
                  : stepAvailable(step.id)
                    ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30 cursor-pointer hover:bg-[var(--success)]/20'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)]/50 border border-[var(--border)] cursor-not-allowed'
                }`}
            >
              <span className="font-mono font-bold">{step.id}</span>
              <span>{step.name}</span>
            </button>
            {i < STEPS.length - 1 && <div className="w-4 h-px bg-[var(--border)] mx-1" />}
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {/* Step headers */}
        {currentStep === 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Step 0: Distribución por días laborables</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Sube el Excel de budget anual (FY 26/27). Distribuye el importe mensual entre días laborables.
            </p>
          </div>
        )}
        {currentStep === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Step 1: Aleatorio ±20%</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Cada día varía ±20% pero el total mensual de cada línea se mantiene exacto.
            </p>
          </div>
        )}
        {currentStep === 2 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Step 2: Negativos</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Facturación negativa aplicada a Fútbol Emotion / Equipaciones. Los 3 primeros laborables
              se reducen y el importe se redistribuye en el resto para mantener el total.
            </p>
          </div>
        )}

        {/* File upload (solo step 0) */}
        {currentStep === 0 && <FileUpload onFileLoaded={handleFileLoaded} />}

        {/* Datos cargados */}
        {activeData && (
          <div className="space-y-4">
            {/* Resumen + acciones */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                <span className="text-sm">
                  {totalLines} líneas · 12 meses · Budget total: {formatNum(totalBudget)} €
                </span>
              </div>
              <div className="flex gap-2">
                {step0Data && (
                  <button
                    onClick={handleGenerateStep1}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded transition-colors"
                  >
                    <Shuffle className="w-3 h-3" />
                    {step1Data ? 'Regenerar ±20%' : 'Generar ±20%'}
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

            {/* Formulario negativos (visible en step 1 o 2 cuando hay step1Data) */}
            {step1Data && (currentStep === 1 || currentStep === 2) && negativosConfig[selectedMonth] && (
              <NegativosForm
                selectedMonth={selectedMonth}
                config={negativosConfig[selectedMonth]}
                onChange={handleUpdateNegConfig}
                onApply={handleApplyNegativos}
              />
            )}

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
