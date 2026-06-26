import { getHolidays } from './holidays';

/**
 * Formatea una fecha como 'YYYY-MM-DD'
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Devuelve true si el día es laborable (no fin de semana y no festivo).
 */
export function isWorkingDay(date: Date, holidays: Set<string>): boolean {
  const dow = date.getDay(); // 0=dom, 6=sáb
  if (dow === 0 || dow === 6) return false;
  return !holidays.has(formatDate(date));
}

/**
 * Calcula los días laborables de un mes dado (year, month 1-12).
 * Devuelve un array de fechas 'YYYY-MM-DD'.
 */
export function getWorkingDays(year: number, month: number): string[] {
  const holidays = getHolidays(year);
  const days: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (isWorkingDay(date, holidays)) {
      days.push(formatDate(date));
    }
  }
  return days;
}

/**
 * Devuelve TODOS los días del mes (para mostrar en tabla),
 * marcando cuáles son laborables.
 */
export function getAllDaysOfMonth(
  year: number,
  month: number
): { date: string; isWorking: boolean; dayOfWeek: number }[] {
  const holidays = getHolidays(year);
  const result: { date: string; isWorking: boolean; dayOfWeek: number }[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    result.push({
      date: formatDate(date),
      isWorking: isWorkingDay(date, holidays),
      dayOfWeek: date.getDay(),
    });
  }
  return result;
}
