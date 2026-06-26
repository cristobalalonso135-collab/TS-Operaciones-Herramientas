/**
 * Festivos de Zaragoza por año.
 * Incluye: nacionales + autonómicos Aragón + locales Zaragoza (San Valero, Cincomarzada).
 *
 * NOTA: Semana Santa y algunos festivos cambian cada año.
 * Actualizar manualmente o cargar desde Supabase.
 */

export const HOLIDAYS_ZARAGOZA: Record<number, string[]> = {
  2025: [
    '2025-01-01', // Año Nuevo
    '2025-01-06', // Epifanía
    '2025-01-29', // San Valero (local)
    '2025-03-05', // Cincomarzada (local)
    '2025-04-17', // Jueves Santo
    '2025-04-18', // Viernes Santo
    '2025-04-23', // San Jorge / Día de Aragón
    '2025-05-01', // Día del Trabajo
    '2025-08-15', // Asunción
    '2025-10-12', // Fiesta Nacional
    '2025-11-01', // Todos los Santos
    '2025-12-06', // Constitución
    '2025-12-08', // Inmaculada
    '2025-12-25', // Navidad
  ],
  2026: [
    '2026-01-01', // Año Nuevo
    '2026-01-06', // Epifanía
    '2026-01-29', // San Valero (local)
    '2026-03-05', // Cincomarzada (local)
    '2026-04-02', // Jueves Santo
    '2026-04-03', // Viernes Santo
    '2026-04-23', // San Jorge / Día de Aragón
    '2026-05-01', // Día del Trabajo
    '2026-08-15', // Asunción
    '2026-10-12', // Fiesta Nacional
    '2026-11-02', // Todos los Santos (trasladado)
    '2026-12-07', // Constitución (trasladado)
    '2026-12-08', // Inmaculada
    '2026-12-25', // Navidad
  ],
  2027: [
    '2027-01-01', // Año Nuevo
    '2027-01-06', // Epifanía
    '2027-01-29', // San Valero (local)
    '2027-03-05', // Cincomarzada (local)
    '2027-03-25', // Jueves Santo
    '2027-03-26', // Viernes Santo
    '2027-04-23', // San Jorge / Día de Aragón
    '2027-05-01', // Día del Trabajo
    '2027-08-16', // Asunción (trasladado al lunes)
    '2027-10-12', // Fiesta Nacional
    '2027-11-01', // Todos los Santos
    '2027-12-06', // Constitución
    '2027-12-08', // Inmaculada
    '2027-12-25', // Navidad
  ],
};

export const HOLIDAY_NAMES_ZARAGOZA: Record<string, string> = {
  '2025-01-01': 'Año Nuevo',
  '2025-01-06': 'Epifanía',
  '2025-01-29': 'San Valero',
  '2025-03-05': 'Cincomarzada',
  '2025-04-17': 'Jueves Santo',
  '2025-04-18': 'Viernes Santo',
  '2025-04-23': 'San Jorge / Día de Aragón',
  '2025-05-01': 'Día del Trabajo',
  '2025-08-15': 'Asunción',
  '2025-10-12': 'Fiesta Nacional',
  '2025-11-01': 'Todos los Santos',
  '2025-12-06': 'Constitución',
  '2025-12-08': 'Inmaculada',
  '2025-12-25': 'Navidad',
  '2026-01-01': 'Año Nuevo',
  '2026-01-06': 'Epifanía',
  '2026-01-29': 'San Valero',
  '2026-03-05': 'Cincomarzada',
  '2026-04-02': 'Jueves Santo',
  '2026-04-03': 'Viernes Santo',
  '2026-04-23': 'San Jorge / Día de Aragón',
  '2026-05-01': 'Día del Trabajo',
  '2026-08-15': 'Asunción',
  '2026-10-12': 'Fiesta Nacional',
  '2026-11-02': 'Todos los Santos (trasladado)',
  '2026-12-07': 'Constitución (trasladado)',
  '2026-12-08': 'Inmaculada',
  '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo',
  '2027-01-06': 'Epifanía',
  '2027-01-29': 'San Valero',
  '2027-03-05': 'Cincomarzada',
  '2027-03-25': 'Jueves Santo',
  '2027-03-26': 'Viernes Santo',
  '2027-04-23': 'San Jorge / Día de Aragón',
  '2027-05-01': 'Día del Trabajo',
  '2027-08-16': 'Asunción (trasladado)',
  '2027-10-12': 'Fiesta Nacional',
  '2027-11-01': 'Todos los Santos',
  '2027-12-06': 'Constitución',
  '2027-12-08': 'Inmaculada',
  '2027-12-25': 'Navidad',
};

/**
 * Devuelve los festivos de un año. Si no están definidos, devuelve solo
 * los fijos (sin Semana Santa — habría que añadirlos).
 */
export function getHolidays(year: number): Set<string> {
  if (HOLIDAYS_ZARAGOZA[year]) {
    return new Set(HOLIDAYS_ZARAGOZA[year]);
  }
  // Festivos fijos (sin Semana Santa)
  const fixed = [
    `${year}-01-01`,
    `${year}-01-06`,
    `${year}-01-29`,
    `${year}-03-05`,
    `${year}-04-23`,
    `${year}-05-01`,
    `${year}-08-15`,
    `${year}-10-12`,
    `${year}-11-01`,
    `${year}-12-06`,
    `${year}-12-08`,
    `${year}-12-25`,
  ];
  return new Set(fixed);
}

export function getHolidayName(dateValue: string): string | null {
  return HOLIDAY_NAMES_ZARAGOZA[dateValue] || null;
}
