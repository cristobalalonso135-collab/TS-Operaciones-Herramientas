import { getWorkingDays, getAllDaysOfMonth } from './working-days';

// ==========================================
// TIPOS
// ==========================================

/** Línea de budget tal como viene del Excel */
export interface BudgetLineInput {
  mes_fiscal: string;       // "01 · Abril"
  area: string;             // "B2B", "Grassroots", "Pro Clubs"
  vertical: string;         // "Fútbol Emotion", "The Pitch", etc.
  medio_venta: string;      // "Equipaciones", "B2B", "Internet", etc.
  pais: string;             // "España", "Francia", etc.
  zona: string;             // "Italia Norte", "Francia", etc.
  importe: number;
  margen_bruto: number;
  pct_margen: number;
}

/** Resultado del Step 0: línea con distribución diaria */
export interface BudgetLineDaily {
  mes_fiscal: string;
  area: string;
  vertical: string;
  medio_venta: string;
  pais: string;
  zona: string;
  importe: number;
  margen_bruto: number;
  pct_margen: number;
  importe_diario: number;
  dias_laborables: number;
  dias: { fecha: string; importe: number; margen: number; is_working: boolean }[];
  total_check: number;
}

/** Datos agrupados por mes fiscal */
export interface MonthData {
  mes_fiscal: string;
  year: number;
  month: number;
  lines: BudgetLineDaily[];
  total_importe: number;
  total_margen: number;
  dias_laborables: number;
}

// ==========================================
// MAPEO MES FISCAL → CALENDARIO
// ==========================================

export const FISCAL_TO_CALENDAR: Record<string, { year: number; month: number }> = {
  '01 · Abril':      { year: 2026, month: 4 },
  '02 · Mayo':       { year: 2026, month: 5 },
  '03 · Junio':      { year: 2026, month: 6 },
  '04 · Julio':      { year: 2026, month: 7 },
  '05 · Agosto':     { year: 2026, month: 8 },
  '06 · Septiembre': { year: 2026, month: 9 },
  '07 · Octubre':    { year: 2026, month: 10 },
  '08 · Noviembre':  { year: 2026, month: 11 },
  '09 · Diciembre':  { year: 2026, month: 12 },
  '10 · Enero':      { year: 2027, month: 1 },
  '11 · Febrero':    { year: 2027, month: 2 },
  '12 · Marzo':      { year: 2027, month: 3 },
};

export const FISCAL_MONTHS_ORDER = [
  '01 · Abril', '02 · Mayo', '03 · Junio',
  '04 · Julio', '05 · Agosto', '06 · Septiembre',
  '07 · Octubre', '08 · Noviembre', '09 · Diciembre',
  '10 · Enero', '11 · Febrero', '12 · Marzo',
];

// ==========================================
// STEP 0: DISTRIBUCIÓN POR LABORABLES
// ==========================================

export function step0_distribuirPorLaborables(
  lines: BudgetLineInput[],
  year: number,
  month: number
): BudgetLineDaily[] {
  const workingDays = getWorkingDays(year, month);
  const allDays = getAllDaysOfMonth(year, month);
  const numWorkingDays = workingDays.length;

  return lines.map((line) => {
    const importeDiario = numWorkingDays > 0 ? line.importe / numWorkingDays : 0;
    const margenDiario = numWorkingDays > 0 ? line.margen_bruto / numWorkingDays : 0;

    const dias = allDays.map((day) => ({
      fecha: day.date,
      importe: day.isWorking ? importeDiario : 0,
      margen: day.isWorking ? margenDiario : 0,
      is_working: day.isWorking,
    }));

    const totalCheck = dias.reduce((sum, d) => sum + d.importe, 0);

    return {
      ...line,
      importe_diario: importeDiario,
      dias_laborables: numWorkingDays,
      dias,
      total_check: totalCheck,
    };
  });
}

/**
 * Procesa todas las líneas del Excel y devuelve datos agrupados por mes fiscal.
 */
export function processFullBudget(allLines: BudgetLineInput[]): MonthData[] {
  const grouped = new Map<string, BudgetLineInput[]>();

  for (const line of allLines) {
    const existing = grouped.get(line.mes_fiscal) || [];
    existing.push(line);
    grouped.set(line.mes_fiscal, existing);
  }

  return FISCAL_MONTHS_ORDER
    .filter((m) => grouped.has(m))
    .map((mesFiscal) => {
      const cal = FISCAL_TO_CALENDAR[mesFiscal];
      if (!cal) return null;

      const monthLines = grouped.get(mesFiscal)!;
      const processed = step0_distribuirPorLaborables(monthLines, cal.year, cal.month);
      const workingDays = getWorkingDays(cal.year, cal.month);

      return {
        mes_fiscal: mesFiscal,
        year: cal.year,
        month: cal.month,
        lines: processed,
        total_importe: monthLines.reduce((s, l) => s + l.importe, 0),
        total_margen: monthLines.reduce((s, l) => s + l.margen_bruto, 0),
        dias_laborables: workingDays.length,
      };
    })
    .filter((d): d is MonthData => d !== null);
}

// ==========================================
// STEP 1: ALEATORIO ±20% (total restringido)
// ==========================================

/**
 * Aplica variación aleatoria ±20% a cada día laborable de cada línea,
 * pero ajusta los valores para que el total mensual de cada línea
 * se mantenga exactamente igual al original.
 *
 * Algoritmo:
 * 1. Genera un factor aleatorio (0.8–1.2) por cada día laborable
 * 2. Multiplica el importe diario base por ese factor
 * 3. Calcula el factor corrector = total_original / total_aleatorio
 * 4. Multiplica cada día por el corrector → total cuadra exacto
 */
export function step1_aleatorioRestringido(step0Data: MonthData[]): MonthData[] {
  return step0Data.map((md) => {
    const newLines = md.lines.map((line) => {
      // 1. Generar factores aleatorios para días laborables
      const rawDias = line.dias.map((d) => {
        if (!d.is_working || d.importe === 0) {
          return { ...d };
        }
        const factor = 0.8 + Math.random() * 0.4; // 0.8 a 1.2
        return {
          ...d,
          importe: d.importe * factor,
          margen: d.margen * factor,
        };
      });

      // 2. Calcular total aleatorio
      const totalAleatorio = rawDias.reduce((s, d) => s + d.importe, 0);
      const totalMargenAleatorio = rawDias.reduce((s, d) => s + d.margen, 0);

      // 3. Factor corrector para que cuadre
      const correctorImporte = totalAleatorio !== 0 ? line.importe / totalAleatorio : 1;
      const correctorMargen = totalMargenAleatorio !== 0 ? line.margen_bruto / totalMargenAleatorio : 1;

      // 4. Aplicar corrector
      const diasCorregidos = rawDias.map((d) => ({
        ...d,
        importe: d.is_working ? d.importe * correctorImporte : 0,
        margen: d.is_working ? d.margen * correctorMargen : 0,
      }));

      const totalCheck = diasCorregidos.reduce((s, d) => s + d.importe, 0);

      return {
        ...line,
        dias: diasCorregidos,
        total_check: totalCheck,
      };
    });

    return {
      ...md,
      lines: newLines,
    };
  });
}

// ==========================================
// PARSER DEL EXCEL
// ==========================================

/**
 * Parsea el Excel "Budget TS FY 26.27".
 * Columnas: # Mes | Área | Vertical | Medio de Venta | País | Zona | Importe | Margen Bruto | % Margen
 */
export function parseExcelData(rows: any[][]): BudgetLineInput[] {
  // Buscar fila de encabezados
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (row && row.some((cell: any) =>
      typeof cell === 'string' && (
        cell.toLowerCase().includes('mes') ||
        cell.toLowerCase().includes('área') ||
        cell.toLowerCase().includes('importe')
      )
    )) {
      headerIdx = i;
      break;
    }
  }

  const headers = (rows[headerIdx] || []).map((h: any) =>
    String(h || '').toLowerCase().trim()
  );

  // Mapear columnas
  const colMap = {
    mes: headers.findIndex((h) => h.includes('mes')),
    area: headers.findIndex((h) => h.includes('área') || h.includes('area')),
    vertical: headers.findIndex((h) => h.includes('vertical')),
    medio: headers.findIndex((h) => h.includes('medio') || h.includes('venta')),
    pais: headers.findIndex((h) => h.includes('país') || h.includes('pais')),
    zona: headers.findIndex((h) => h.includes('zona')),
    importe: headers.findIndex((h) => h.includes('importe')),
    margen: headers.findIndex((h) => h.includes('margen') && !h.includes('%')),
    pct: headers.findIndex((h) => h.includes('%')),
  };

  const dataRows = rows.slice(headerIdx + 1).filter((row) =>
    row && row.length > 0 && row.some((cell: any) => cell !== null && cell !== undefined && cell !== '')
  );

  return dataRows
    .map((row) => {
      const importe = colMap.importe >= 0 ? Number(row[colMap.importe]) : 0;
      if (!importe || isNaN(importe)) return null;

      const mesFiscal = colMap.mes >= 0 ? String(row[colMap.mes] || '') : '';
      if (!mesFiscal || !FISCAL_TO_CALENDAR[mesFiscal]) return null;

      return {
        mes_fiscal: mesFiscal,
        area: colMap.area >= 0 ? String(row[colMap.area] || '') : '',
        vertical: colMap.vertical >= 0 ? String(row[colMap.vertical] || '') : '',
        medio_venta: colMap.medio >= 0 ? String(row[colMap.medio] || '') : '',
        pais: colMap.pais >= 0 ? String(row[colMap.pais] || '') : '',
        zona: colMap.zona >= 0 ? String(row[colMap.zona] || '') : '',
        importe,
        margen_bruto: colMap.margen >= 0 ? Number(row[colMap.margen]) || 0 : 0,
        pct_margen: colMap.pct >= 0 ? Number(row[colMap.pct]) || 0 : 0,
      };
    })
    .filter((line): line is BudgetLineInput => line !== null);
}
