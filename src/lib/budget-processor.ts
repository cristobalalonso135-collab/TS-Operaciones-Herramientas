import { getWorkingDays, getAllDaysOfMonth } from './working-days';

export interface BudgetLineInput {
  mes_fiscal: string;
  area: string;
  vertical: string;
  medio_venta: string;
  pais: string;
  zona: string;
  importe: number;
  margen_bruto: number;
  pct_margen: number;
}

export interface BudgetDayValue {
  fecha: string;
  importe: number;
  margen: number;
  is_working: boolean;
}

export interface BudgetLineDaily extends BudgetLineInput {
  importe_diario: number;
  dias_laborables: number;
  dias: BudgetDayValue[];
  total_check: number;
}

export interface MonthData {
  mes_fiscal: string;
  year: number;
  month: number;
  lines: BudgetLineDaily[];
  total_importe: number;
  total_margen: number;
  dias_laborables: number;
}

export const FISCAL_TO_CALENDAR: Record<string, { year: number; month: number }> = {
  '01 · Abril': { year: 2026, month: 4 },
  '02 · Mayo': { year: 2026, month: 5 },
  '03 · Junio': { year: 2026, month: 6 },
  '04 · Julio': { year: 2026, month: 7 },
  '05 · Agosto': { year: 2026, month: 8 },
  '06 · Septiembre': { year: 2026, month: 9 },
  '07 · Octubre': { year: 2026, month: 10 },
  '08 · Noviembre': { year: 2026, month: 11 },
  '09 · Diciembre': { year: 2026, month: 12 },
  '10 · Enero': { year: 2027, month: 1 },
  '11 · Febrero': { year: 2027, month: 2 },
  '12 · Marzo': { year: 2027, month: 3 },
};

export const FISCAL_MONTHS_ORDER = [
  '01 · Abril', '02 · Mayo', '03 · Junio',
  '04 · Julio', '05 · Agosto', '06 · Septiembre',
  '07 · Octubre', '08 · Noviembre', '09 · Diciembre',
  '10 · Enero', '11 · Febrero', '12 · Marzo',
];

export function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeFiscalMonth(value: string): string {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');
  const found = FISCAL_MONTHS_ORDER.find((month) => {
    const candidate = normalizeText(month).replace(/\s+/g, ' ');
    const monthName = candidate.split(' ').slice(-1)[0];
    return normalized === candidate || normalized.includes(monthName);
  });

  return found || value;
}

function parseExcelNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined || value === '') return 0;

  const cleaned = String(value)
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(cleaned) || 0;
}

export function isNegativosTargetLine(line: Pick<BudgetLineInput, 'vertical' | 'medio_venta'>): boolean {
  const vertical = normalizeText(line.vertical);
  const medioVenta = normalizeText(line.medio_venta);
  const isFutbolEmotion =
    vertical.includes('futbol emotion') ||
    vertical.includes('fútbol emotion') ||
    vertical.includes('football emotion');
  const isEquipaciones = medioVenta === 'equipaciones';

  return isFutbolEmotion && isEquipaciones;
}

export function getNegativosZonasForMonth(monthData: MonthData): string[] {
  return Array.from(
    new Set(
      monthData.lines
        .filter((line) => isNegativosTargetLine(line) && line.importe !== 0)
        .map((line) => line.zona)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'es'));
}

export interface WeekBucket {
  id: string;
  label: string;
  dates: string[];
}

export interface WeeklyWeightConfig {
  mediaGrowth: Record<string, Record<string, number>>;
}

export interface WeeklySummary {
  medio: string;
  weekId: string;
  label: string;
  workingDays: number;
  currentBudget: number;
  currentDailyAverage: number;
  growthPct: number;
  targetBudget: number;
  targetDailyAverage: number;
}

export const WEEKLY_TARGET_MEDIOS = ['Equipaciones', 'Equipaciones Web B2C'];

export function normalizeMedioVenta(value: string): string {
  const medioVenta = normalizeText(value);
  if (medioVenta === 'equipaciones') return 'Equipaciones';
  if (medioVenta === 'equipaciones web b2c') return 'Equipaciones Web B2C';
  return value;
}

export function isWeeklyTargetLine(line: Pick<BudgetLineInput, 'medio_venta'>, medio?: string): boolean {
  const medioVenta = normalizeText(line.medio_venta);
  if (medio) return medioVenta === normalizeText(medio);
  return WEEKLY_TARGET_MEDIOS.some((targetMedio) => medioVenta === normalizeText(targetMedio));
}

export function getWeeksForMonthData(monthData: MonthData): WeekBucket[] {
  const buckets = new Map<string, WeekBucket>();

  for (const day of monthData.lines[0]?.dias || []) {
    const date = new Date(day.fecha);
    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const offset = (monthStart.getUTCDay() + 6) % 7;
    const weekNumber = Math.floor((date.getUTCDate() + offset - 1) / 7) + 1;
    const id = `W${weekNumber}`;
    const existing = buckets.get(id);

    if (existing) {
      existing.dates.push(day.fecha);
    } else {
      buckets.set(id, {
        id,
        label: `Semana ${weekNumber}`,
        dates: [day.fecha],
      });
    }
  }

  return Array.from(buckets.values());
}

export function defaultWeeklyWeightConfig(monthData: MonthData): WeeklyWeightConfig {
  const weeks = getWeeksForMonthData(monthData);

  return {
    mediaGrowth: Object.fromEntries(
      WEEKLY_TARGET_MEDIOS.map((medio) => [
        medio,
        Object.fromEntries(weeks.map((week) => [week.id, 0])),
      ])
    ),
  };
}

function getWorkingDayCountForWeek(week: WeekBucket, monthData: MonthData): number {
  const firstLine = monthData.lines[0];
  if (!firstLine) return 0;

  return firstLine.dias.filter((day) => week.dates.includes(day.fecha) && day.is_working).length;
}

function getWeeklyFactors(weeks: WeekBucket[], growthByWeek: Record<string, number>): Record<string, number> {
  let factor = 1;
  const result: Record<string, number> = {};

  weeks.forEach((week, index) => {
    if (index > 0) {
      factor *= 1 + ((growthByWeek[week.id] || 0) / 100);
    }
    result[week.id] = factor;
  });

  return result;
}

function getTargetBudgetByWeek(monthData: MonthData, medio: string, config: WeeklyWeightConfig): Record<string, number> {
  const weeks = getWeeksForMonthData(monthData);
  const targetLines = monthData.lines.filter((line) => isWeeklyTargetLine(line, medio));
  const totalTarget = targetLines.reduce((sum, line) => sum + line.importe, 0);
  const growthByWeek = config.mediaGrowth[medio] || {};
  const factors = getWeeklyFactors(weeks, growthByWeek);
  const denominator = weeks.reduce((sum, week) => (
    sum + getWorkingDayCountForWeek(week, monthData) * (factors[week.id] || 0)
  ), 0);
  const baseDailyBudget = denominator !== 0 ? totalTarget / denominator : 0;

  return Object.fromEntries(
    weeks.map((week) => [
      week.id,
      baseDailyBudget * (factors[week.id] || 0) * getWorkingDayCountForWeek(week, monthData),
    ])
  );
}

export function getWeeklySummary(monthData: MonthData, config: WeeklyWeightConfig, medio: string): WeeklySummary[] {
  const weeks = getWeeksForMonthData(monthData);
  const targetLines = monthData.lines.filter((line) => isWeeklyTargetLine(line, medio));
  const targetBudgetByWeek = getTargetBudgetByWeek(monthData, medio, config);
  const growthByWeek = config.mediaGrowth[medio] || {};

  return weeks.map((week) => {
    const workingDays = getWorkingDayCountForWeek(week, monthData);
    const currentBudget = targetLines.reduce((sum, line) => (
      sum + line.dias
        .filter((day) => week.dates.includes(day.fecha))
        .reduce((daySum, day) => daySum + day.importe, 0)
    ), 0);
    const targetBudget = targetBudgetByWeek[week.id] || 0;

    return {
      medio,
      weekId: week.id,
      label: week.label,
      workingDays,
      currentBudget,
      currentDailyAverage: workingDays > 0 ? currentBudget / workingDays : 0,
      growthPct: growthByWeek[week.id] || 0,
      targetBudget,
      targetDailyAverage: workingDays > 0 ? targetBudget / workingDays : 0,
    };
  });
}

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

export function step1_aleatorioRestringido(step0Data: MonthData[]): MonthData[] {
  return step0Data.map((md) => {
    const newLines = md.lines.map((line) => {
      const rawDias = line.dias.map((d) => {
        if (!d.is_working || d.importe === 0) return { ...d };

        const factor = 0.8 + Math.random() * 0.4;
        return {
          ...d,
          importe: d.importe * factor,
          margen: d.margen * factor,
        };
      });

      const totalAleatorio = rawDias.reduce((s, d) => s + d.importe, 0);
      const totalMargenAleatorio = rawDias.reduce((s, d) => s + d.margen, 0);
      const correctorImporte = totalAleatorio !== 0 ? line.importe / totalAleatorio : 1;
      const correctorMargen = totalMargenAleatorio !== 0 ? line.margen_bruto / totalMargenAleatorio : 1;

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
      total_importe: newLines.reduce((s, l) => s + l.total_check, 0),
    };
  });
}

export interface NegativosZona {
  zona: string;
  web_b2c_anterior: number;
  pct_gen_web: number;
  grassroots: number;
  pct_frees: number;
}

export interface NegativosConfig {
  zonas: NegativosZona[];
  ponderacion: number[];
}

export function calcularNegativoZona(z: NegativosZona): { gen_web: number; frees: number; total: number } {
  const gen_web = z.web_b2c_anterior * (z.pct_gen_web / 100);
  const frees = z.grassroots * (z.pct_frees / 100);
  return { gen_web, frees, total: gen_web + frees };
}

export function step2_negativos(
  step1Data: MonthData[],
  negativosPorMes: Record<string, NegativosConfig>
): MonthData[] {
  return step1Data.map((md) => {
    const config = negativosPorMes[md.mes_fiscal];
    if (!config || config.zonas.length === 0) return md;

    const negativosMap = new Map<string, number>();
    for (const z of config.zonas) {
      const { total } = calcularNegativoZona(z);
      negativosMap.set(z.zona, total);
    }

    const ponderacion = config.ponderacion;
    const targetLinesByZona = new Map<string, number>();

    for (const line of md.lines) {
      if (!isNegativosTargetLine(line)) continue;
      targetLinesByZona.set(line.zona, (targetLinesByZona.get(line.zona) || 0) + Math.abs(line.importe));
    }

    const newLines = md.lines.map((line) => {
      if (!isNegativosTargetLine(line)) return line;

      const negativoZona = negativosMap.get(line.zona);
      if (!negativoZona || negativoZona === 0) return line;

      const totalZona = targetLinesByZona.get(line.zona) || 0;
      const pesoLinea = totalZona > 0 ? Math.abs(line.importe) / totalZona : 1;
      const negativoLinea = negativoZona * pesoLinea;
      const workingIndices = line.dias
        .map((d, i) => (d.is_working ? i : -1))
        .filter((i) => i >= 0);

      if (workingIndices.length === 0) return line;

      const totalRestado = ponderacion.reduce((s, p) => s + negativoLinea * p, 0);
      const restantesIndices = workingIndices.slice(ponderacion.length);
      const sumaRestantes = restantesIndices.reduce((s, i) => s + line.dias[i].importe, 0);

      const newDias = line.dias.map((d, i) => {
        const wIdx = workingIndices.indexOf(i);

        if (wIdx >= 0 && wIdx < ponderacion.length) {
          return {
            ...d,
            importe: d.importe - negativoLinea * ponderacion[wIdx],
            margen: d.margen,
          };
        }

        if (wIdx >= ponderacion.length && sumaRestantes !== 0) {
          const proporcion = d.importe / sumaRestantes;
          return {
            ...d,
            importe: d.importe + totalRestado * proporcion,
            margen: d.margen,
          };
        }

        return d;
      });

      const totalCheck = newDias.reduce((s, d) => s + d.importe, 0);

      return {
        ...line,
        dias: newDias,
        total_check: totalCheck,
      };
    });

    return {
      ...md,
      lines: newLines,
      total_importe: newLines.reduce((s, l) => s + l.total_check, 0),
    };
  });
}

export function step3_ponderacionSemanal(
  inputData: MonthData[],
  weeklyConfigByMonth: Record<string, WeeklyWeightConfig>
): MonthData[] {
  return inputData.map((md) => {
    const config = weeklyConfigByMonth[md.mes_fiscal];
    if (!config) return md;

    const weeks = getWeeksForMonthData(md);
    if (weeks.length === 0) return md;
    const targetBudgetByMedio = Object.fromEntries(
      WEEKLY_TARGET_MEDIOS.map((medio) => [medio, getTargetBudgetByWeek(md, medio, config)])
    );

    const newLines = md.lines.map((line) => {
      const medio = WEEKLY_TARGET_MEDIOS.find((targetMedio) => isWeeklyTargetLine(line, targetMedio));
      if (!medio) return line;

      const newDias = line.dias.map((day) => ({ ...day }));
      const totalMedio = md.lines
        .filter((candidate) => isWeeklyTargetLine(candidate, medio))
        .reduce((sum, candidate) => sum + candidate.importe, 0);
      const lineShare = totalMedio !== 0 ? line.importe / totalMedio : 0;

      for (const week of weeks) {
        const weekIndices = line.dias
          .map((day, index) => (week.dates.includes(day.fecha) && day.is_working ? index : -1))
          .filter((index) => index >= 0);

        if (weekIndices.length === 0) continue;

        const targetImporteWeek = (targetBudgetByMedio[medio]?.[week.id] || 0) * lineShare;
        const targetMargenWeek = line.margen_bruto * (line.importe !== 0 ? targetImporteWeek / line.importe : 0);
        const currentImporteWeek = weekIndices.reduce((sum, index) => sum + line.dias[index].importe, 0);
        const currentMargenWeek = weekIndices.reduce((sum, index) => sum + line.dias[index].margen, 0);

        for (const index of weekIndices) {
          const importeShare = currentImporteWeek !== 0
            ? line.dias[index].importe / currentImporteWeek
            : 1 / weekIndices.length;
          const margenShare = currentMargenWeek !== 0
            ? line.dias[index].margen / currentMargenWeek
            : 1 / weekIndices.length;

          newDias[index] = {
            ...newDias[index],
            importe: targetImporteWeek * importeShare,
            margen: targetMargenWeek * margenShare,
          };
        }
      }

      const totalCheck = newDias.reduce((sum, day) => sum + day.importe, 0);

      return {
        ...line,
        dias: newDias,
        total_check: totalCheck,
      };
    });

    return {
      ...md,
      lines: newLines,
      total_importe: newLines.reduce((sum, line) => sum + line.total_check, 0),
      total_margen: newLines.reduce((sum, line) => sum + line.margen_bruto, 0),
    };
  });
}

export const ZONAS_DEFAULT = [
  'Centro-Sur',
  'Francia',
  'Italia Centro-Sur',
  'Italia Norte',
  'Levante',
  'Norte',
  'Portugal',
];

export function defaultNegativosConfig(zonas = ZONAS_DEFAULT): NegativosConfig {
  return {
    zonas: zonas.map((zona) => ({
      zona,
      web_b2c_anterior: 10000,
      pct_gen_web: 10,
      grassroots: 10000,
      pct_frees: 10,
    })),
    ponderacion: [0.6, 0.25, 0.15],
  };
}

export function parseExcelData(rows: any[][]): BudgetLineInput[] {
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (row && row.some((cell: any) => {
      const value = normalizeText(String(cell || ''));
      return value.includes('mes') || value.includes('area') || value.includes('importe');
    })) {
      headerIdx = i;
      break;
    }
  }

  const headers = (rows[headerIdx] || []).map((h: any) => normalizeText(String(h || '')));
  const colMap = {
    mes: headers.findIndex((h) => h.includes('mes')),
    area: headers.findIndex((h) => h.includes('area')),
    vertical: headers.findIndex((h) => h.includes('vertical')),
    medio: headers.findIndex((h) => h.includes('medio') || h.includes('venta')),
    pais: headers.findIndex((h) => h.includes('pais')),
    zona: headers.findIndex((h) => h.includes('zona')),
    importe: headers.findIndex((h) => h.includes('importe')),
    margen: headers.findIndex((h) => h.includes('margen') && !h.includes('%')),
    pct: headers.findIndex((h) => h.includes('%')),
  };

  const requiredColumns: Array<[string, number]> = [
    ['# Mes', colMap.mes],
    ['Area', colMap.area],
    ['Vertical', colMap.vertical],
    ['Medio de Venta', colMap.medio],
    ['Pais', colMap.pais],
    ['Zona', colMap.zona],
    ['Importe', colMap.importe],
    ['Margen Bruto', colMap.margen],
    ['% Margen', colMap.pct],
  ];
  const missingColumns = requiredColumns.filter(([, idx]) => idx < 0).map(([name]) => name);

  if (missingColumns.length > 0) {
    throw new Error(`Faltan columnas obligatorias: ${missingColumns.join(', ')}`);
  }

  const dataRows = rows.slice(headerIdx + 1).filter((row) =>
    row && row.length > 0 && row.some((cell: any) => cell !== null && cell !== undefined && cell !== '')
  );

  const parsed = dataRows
    .map((row) => {
      const importe = parseExcelNumber(row[colMap.importe]);
      if (!importe || isNaN(importe)) return null;

      const mesFiscal = normalizeFiscalMonth(String(row[colMap.mes] || ''));
      if (!mesFiscal || !FISCAL_TO_CALENDAR[mesFiscal]) return null;

      return {
        mes_fiscal: mesFiscal,
        area: String(row[colMap.area] || ''),
        vertical: String(row[colMap.vertical] || ''),
        medio_venta: String(row[colMap.medio] || ''),
        pais: String(row[colMap.pais] || ''),
        zona: String(row[colMap.zona] || ''),
        importe,
        margen_bruto: parseExcelNumber(row[colMap.margen]),
        pct_margen: parseExcelNumber(row[colMap.pct]),
      };
    })
    .filter((line): line is BudgetLineInput => line !== null);

  if (parsed.length === 0) {
    throw new Error('No se ha encontrado ninguna linea valida para el FY 26/27.');
  }

  return parsed;
}
