export interface HolidayInfo {
  name: string;
  detail: string;
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * Formatea una fecha como "YYYY-MM-DD" usando los componentes LOCALES del Date
 * (no UTC). Equivalente seguro a `date.toISOString().split('T')[0]`, que falla en
 * timezones positivas porque convierte a UTC primero y puede retroceder un día.
 *
 * Para Venezuela (UTC-4) el cambio no introduce diferencia visible cuando se llama
 * con una fecha construida vía `new Date(year, monthIdx, day)` a medianoche local,
 * pero hace el código robusto si el sistema cambia de timezone o si se usa con
 * `new Date()` cerca de medianoche.
 */
export const formatHolidayDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const formatLocalDateKey = formatHolidayDateKey;

/**
 * Convierte un string de fecha (YYYY-MM-DD o ISO con T) en formato dd/mm/yyyy
 * SIN pasar por `new Date()`. Esto evita el off-by-one que ocurre cuando
 * Postgres devuelve un campo `date` como "2025-10-04" y JS lo parsea como
 * UTC midnight: en zonas horarias negativas (VE -4) `toLocaleDateString()`
 * mostraría 3/10/2025 en vez de 4/10/2025.
 *
 * Devuelve `fallback` si el string es vacío o malformado.
 */
export const formatDateVE = (isoDate?: string | null, fallback = 'N/A'): string => {
  if (!isoDate) return fallback;
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  if (!y || !m || !d) return isoDate;
  return `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
};

export const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

export const getVenezuelanHolidays = (year: number): Record<string, HolidayInfo> => {
  const holidays: Record<string, HolidayInfo> = {};

  const addHoliday = (date: Date, name: string, detail: string) => {
    holidays[formatHolidayDateKey(date)] = { name, detail };
  };

  addHoliday(new Date(year, 0, 1), 'Año Nuevo', 'Celebración del inicio de año.');
  addHoliday(new Date(year, 3, 19), '19 de Abril', 'Declaración de la Independencia de Venezuela (1810).');
  addHoliday(new Date(year, 4, 1), 'Día del Trabajador', 'Conmemoración internacional del trabajo.');
  addHoliday(new Date(year, 5, 24), 'Batalla de Carabobo', 'Conmemoración de la Batalla de Carabobo (1821).');
  addHoliday(new Date(year, 6, 5), 'Día de la Independencia', 'Firma del Acta de la Independencia (1811).');
  addHoliday(new Date(year, 6, 24), 'Natalicio de Simón Bolívar', 'Conmemoración del nacimiento del Libertador.');
  addHoliday(new Date(year, 9, 12), 'Día de la Resistencia Indígena', 'Conmemoración de la resistencia de los pueblos originarios.');
  addHoliday(new Date(year, 11, 24), 'Nochebuena', 'Asueto navideño.');
  addHoliday(new Date(year, 11, 25), 'Navidad', 'Celebración de la Navidad.');
  addHoliday(new Date(year, 11, 31), 'Fin de Año', 'Asueto de cierre de año.');

  const easterSunday = getEasterSunday(year);
  const carnavalMonday = new Date(easterSunday);
  carnavalMonday.setDate(easterSunday.getDate() - 48);
  const carnavalTuesday = new Date(easterSunday);
  carnavalTuesday.setDate(easterSunday.getDate() - 47);
  const holyThursday = new Date(easterSunday);
  holyThursday.setDate(easterSunday.getDate() - 3);
  const holyFriday = new Date(easterSunday);
  holyFriday.setDate(easterSunday.getDate() - 2);

  addHoliday(carnavalMonday, 'Lunes de Carnaval', 'Inicio del asueto de Carnaval.');
  addHoliday(carnavalTuesday, 'Martes de Carnaval', 'Cierre del asueto de Carnaval.');
  addHoliday(holyThursday, 'Jueves Santo', 'Conmemoración de Semana Santa.');
  addHoliday(holyFriday, 'Viernes Santo', 'Conmemoración de Semana Santa.');

  return holidays;
};

export const isVenezuelanHoliday = (
  dateStr: string,
  holidaysCache?: Record<string, HolidayInfo>
): boolean => {
  if (!dateStr) return false;
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  const holidays = holidaysCache ?? getVenezuelanHolidays(year);
  return Boolean(holidays[dateStr]);
};
