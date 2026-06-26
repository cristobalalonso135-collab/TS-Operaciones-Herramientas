'use client';

import { useState, useCallback } from 'react';
import FileUpload from '@/components/FileUpload';
import BudgetTable from '@/components/BudgetTable';
import StepIndicator from '@/components/StepIndicator';
import {
  parseExcelData,
  processFullBudget,
  MonthData,
  FISCAL_MONTHS_ORDER,
} from '@/lib/budget-processor';
import { FileSpreadsheet } from 'lucide-react';

const STEPS = [
  { id: 0, name: 'Distribución diaria', description: 'Mensual → días laborables', active: true, completed: false },
  { id: 1, name: 'Budget base', description: 'Datos pegados', active: false, completed: false },
  { id: 2, name: 'Aleatorio', description: '±20% variabilidad', active: false, completed: false },
  { id: 3, name: 'Congelado', description: 'Valores fijos', active: false, completed: false },
  { id: 4, name: 'Ajustada', description: 'Factor corrector', active: false, completed: false },
  { id: 5, name: 'Negativos', description: 'Restar ajustes', active: false, completed: false },
  { id: 6, name: 'Definitiva', description: 'T4 − T5', active: false, completed: false },
  { id: 7, name: 'Crecimiento', description: 'Ponderación semanal', active: false, completed: false },
  { id: 8, name: 'Correcta', description: 'Resultado final', active: false, completed: false },
];

function formatNum(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function Home() {
  const [currentStep] = useState(0);
  const [monthsData, setMonthsData] = useState<MonthData[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(FISCAL_MONTHS_ORDER[0]);
  const [totalLines, setTotalLines] = useState(0);

  const handleFileLoaded = useCallback((data: any[][], _fileName: string) => {
    const parsed = parseExcelData(data);
    setTotalLines(parsed.length);
    const processed = processFullBudget(parsed);
    setMonthsData(processed);
    if (processed.length > 0) {
      setSelectedMonth(processed[0].mes_fiscal);
    }
  }, []);

  const currentMonthData = monthsData?.find((m) => m.mes_fiscal === selectedMonth);
  const totalBudget = monthsData?.reduce((s, m) => s + m.total_importe, 0) || 0;

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} currentStep={currentStep} />

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">
            Step 0: Distribución por días laborables
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Sube el Excel de budget anual (FY 26/27). La app distribuye el importe mensual
            de cada línea entre los días laborables del mes (sin fines de semana ni festivos de Zaragoza).
          </p>
        </div>

        <FileUpload onFileLoaded={handleFileLoaded} />

        {/* Resumen general */}
        {monthsData && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
              <span className="text-sm">
                {totalLines} líneas · 12 meses · Budget total: {formatNum(totalBudget)} €
              </span>
            </div>

            {/* Tabs de meses */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {monthsData.map((md) => (
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

            {/* Tabla del mes seleccionado */}
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
