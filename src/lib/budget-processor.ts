import { getWorkingDays, getAllDaysOfMonth } from './working-days';

/**
 * Estructura de una línea de budget tal como viene del Excel.
 * El Excel tiene columnas: Índice, id_vertical, nombre, zona_equipaciones, cod_mercado, importe_mensual
 */
export interface BudgetLineInput {
  indice: number;
  id_vertical: number;
  nombre: string;
  zona_equipaciones: string;
  cod_mercado: string;
  importe_mensual: number;
}

/**
 * Resultado del Step 0: cada línea con su importe diario distribuido.
 */
export interface BudgetLineDaily {
  indice: number;
  id_vertical: number;
  nombre: string;
  zona_equipaciones: string;
  cod_mercado: string;
  importe_mensual: number;
  importe_diario: number;
  dias_laborables: number;
  dias: { fecha: string; importe: number; is_working: boolean }[];
  total_check: number; // debería ser === importe_mensual
}

/**
 * STEP 0: Distribuir importe mensual homogéneamente entre días laborables.
 *
 * - Toma el importe mensual de cada línea
 * - Lo divide entre el número de días laborables del mes
 * - Asigna ese importe a cada día laborable; 0 a los no laborables
 */
export function step0_distribuirPorLaborables(
  lines: BudgetLineInput[],
  year: number,
  month: number
): BudgetLineDaily[] {
  const workingDays = getWorkingDays(year, month);
  const allDays = getAllDaysOfMonth(year, month);
  const numWorkingDays = workingDays.length;
  const workingSet = new Set(workingDays);

  return lines.map((line) => {
    const importeDiario =
      numWorkingDays > 0 ? line.importe_mensual / numWorkingDays : 0;

    const dias = allDays.map((day) => ({
      fecha: day.date,
      importe: day.isWorking ? importeDiario : 0,
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
 * Parsear el Excel subido (Step 0 input).
 * Espera columnas: indice | id_vertical | nombre | zona_equipaciones | cod_mercado | importe_mensual
 * (o similar, se mapean por posición)
 */
export function parseExcelData(rows: any[][]): BudgetLineInput[] {
  // Detectar fila de encabezados
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (row && row.some((cell: any) => typeof cell === 'string' &&
      (cell.toLowerCase().includes('indice') ||
       cell.toLowerCase().includes('índice') ||
       cell.toLowerCase().includes('nombre')))) {
      headerIdx = i;
      break;
    }
  }

  const headers = (rows[headerIdx] || []).map((h: any) =>
    String(h || '').toLowerCase().trim()
  );

  // Mapear columnas por nombre
  const colMap = {
    indice: headers.findIndex((h) => h.includes('indice') || h.includes('índice')),
    id_vertical: headers.findIndex((h) => h.includes('id_vertical') || h.includes('vertical')),
    nombre: headers.findIndex((h) => h.includes('nombre') || h.includes('name')),
    zona: headers.findIndex((h) => h.includes('zona')),
    mercado: headers.findIndex((h) => h.includes('mercado') || h.includes('cod_mercado')),
    importe: headers.findIndex((h) =>
      h.includes('importe') || h.includes('budget') || h.includes('total') || h.includes('mensual')
    ),
  };

  // Si no se encuentra importe por nombre, usar la última columna numérica
  const dataRows = rows.slice(headerIdx + 1).filter((row) =>
    row && row.length > 0 && row.some((cell: any) => cell !== null && cell !== undefined && cell !== '')
  );

  if (colMap.importe === -1) {
    // Buscar la última columna que tenga números en la primera fila de datos
    const firstDataRow = dataRows[0];
    if (firstDataRow) {
      for (let i = firstDataRow.length - 1; i >= 0; i--) {
        if (typeof firstDataRow[i] === 'number') {
          colMap.importe = i;
          break;
        }
      }
    }
  }

  return dataRows
    .map((row) => {
      const importe = colMap.importe >= 0 ? Number(row[colMap.importe]) : 0;
      if (!importe || isNaN(importe)) return null;

      return {
        indice: colMap.indice >= 0 ? Number(row[colMap.indice]) || 0 : 0,
        id_vertical: colMap.id_vertical >= 0 ? Number(row[colMap.id_vertical]) || 0 : 0,
        nombre: colMap.nombre >= 0 ? String(row[colMap.nombre] || '') : '',
        zona_equipaciones: colMap.zona >= 0 ? String(row[colMap.zona] || '') : '',
        cod_mercado: colMap.mercado >= 0 ? String(row[colMap.mercado] || '') : '',
        importe_mensual: importe,
      };
    })
    .filter((line): line is BudgetLineInput => line !== null);
}
