'use client';

import { useState, useCallback } from 'react';
import FileUpload from '@/components/FileUpload';
import BudgetTable from '@/components/BudgetTable';
import StepIndicator from '@/components/StepIndicator';
import {
  parseExcelData,
  step0_distribuirPorLaborables,
  BudgetLineDaily,
} from '@/lib/budget-processor';
import { getWorkingDays } from '@/lib/working-days';
import { Calendar, ChevronDown } from 'lucide-react';

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

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function Home() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [currentStep] = useState(0);
  const [result, setResult] = useState<BudgetLineDaily[] | null>(null);
  const [rawLines, setRawLines] = useState<number>(0);

  const workingDays = getWorkingDays(year, month);

  const handleFileLoaded = useCallback(
    (data: any[][], _fileName: string) => {
      const parsed = parseExcelData(data);
      setRawLines(parsed.length);
      const processed = step0_distribuirPorLaborables(parsed, year, month);
      setResult(processed);
    },
    [year, month]
  );

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <StepIndicator steps={STEPS} currentStep={currentStep} />

      {/* Step 0 content */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">
            Step 0: Distribución por días laborables
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Sube un Excel con el importe mensual por línea. La app lo distribuirá
            homogéneamente entre los {workingDays.length} días laborables de{' '}
            {MONTHS[month - 1]} {year} (sin fines de semana ni festivos de Zaragoza).
          </p>
        </div>

        {/* Config: year + month */}
        <div className="flex gap-4 items-end">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />
              Año
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-1.5 text-sm"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Mes</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-1.5 text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            <span className="font-mono text-[var(--accent)]">{workingDays.length}</span> días laborables
          </div>
        </div>

        {/* File upload */}
        <FileUpload onFileLoaded={handleFileLoaded} />

        {/* Results */}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
              <span className="text-sm">
                {rawLines} líneas procesadas correctamente
              </span>
            </div>
            <BudgetTable data={result} year={year} month={month} />
          </div>
        )}
      </div>
    </div>
  );
}
