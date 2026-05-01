import type { Asistencia, Empleado, ConfigGlobal } from "../types.ts";
import test from 'node:test';
import assert from 'node:assert';
import {
  calculateDetailedShift,
  processAttendanceRecords,
  calculatePayroll,
  calculateLOTTTEarnings,
  calculateSeniorityYears,
  timeToDecimal,
  LOTTT_RECARGOS,
} from './payrollService.ts';

const mkEmpleado = (overrides: Partial<Empleado> = {}): Empleado =>
  ({
    id: 'e1',
    nombre: 'Juan',
    apellido: 'Pérez',
    cedula: 'V-1',
    cargo: 'Vendedor',
    telefono: '',
    fecha_ingreso: '2024-01-15',
    salario_usd: 100,
    salario_base_vef: 0,
    sucursal_id: 's1',
    activo: true,
    ...overrides,
  }) as Empleado;

const mkConfig = (overrides: Partial<ConfigGlobal> = {}): ConfigGlobal =>
  ({
    id: 'c1',
    tasa_bcv: 100,
    salario_minimo_vef: 130,
    cestaticket_usd: 40,
    dias_utilidades: 60,
    dias_bono_vacacional_base: 15,
    ...overrides,
  }) as ConfigGlobal;

const yearsAgo = (n: number) => {
  const hoy = new Date();
  return new Date(hoy.getFullYear() - n, hoy.getMonth(), hoy.getDate() - 1)
    .toISOString()
    .slice(0, 10);
};

// Tests for shift crossing midnight

// --- Regresión TZ: la DB guarda hora_entrada/hora_salida como timestamptz UTC.
// El parsing debe usar getUTC* para no desplazar la hora según la TZ del cliente.
test('timeToDecimal: HH:MM literal', () => {
  assert.strictEqual(timeToDecimal('08:30'), 8.5);
  assert.strictEqual(timeToDecimal('00:00'), 0);
  assert.strictEqual(timeToDecimal('23:59'), 24.0);
});

test('timeToDecimal: timestamp con offset UTC retorna la hora UTC, no la local', () => {
  // Supabase retorna "2026-04-15T09:00:00+00:00" para una hora_entrada guardada
  // como "09:00". Cualquier cliente (VE -4, Madrid +1, Tokio +9) debe leer 9.0.
  assert.strictEqual(timeToDecimal('2026-04-15T09:00:00+00:00'), 9.0);
  assert.strictEqual(timeToDecimal('2026-04-15 09:00:00+00'), 9.0);
  assert.strictEqual(timeToDecimal('2026-04-15T18:30:00+00:00'), 18.5);
  assert.strictEqual(timeToDecimal('2026-04-15T00:00:00Z'), 0);
});

test('timeToDecimal: timestamp SIN offset se trata como UTC (no como hora local)', () => {
  // El AttendanceManager construye `${selectedDate}T${hora}:00` sin offset al
  // calcular el preview de la jornada. `new Date()` lo interpretaba como hora
  // local y getUTCHours sumaba el offset del cliente, generando "horas nocturnas
  // fantasma" para turnos diurnos. Debe retornar la hora literal sin desplazar.
  assert.strictEqual(timeToDecimal('2026-04-11T08:00:00'), 8.0);
  assert.strictEqual(timeToDecimal('2026-04-11T18:00:00'), 18.0);
  assert.strictEqual(timeToDecimal('2026-04-11T22:30:00'), 22.5);
});

test('calculateDetailedShift: turno 08:00→18:00 sin offset NO debe contar horas nocturnas', () => {
  // Regresión del bug donde el preview en AttendanceManager mostraba 3.0h
  // nocturnas para una jornada diurna porque `${date}T${hora}` se interpretaba
  // como hora local en VE (UTC-4) y getUTCHours desplazaba el inicio a 12.
  const r = calculateDetailedShift('2026-04-11T08:00:00', '2026-04-11T18:00:00', '2026-04-11');
  assert.strictEqual(r.nightHours, 0, 'jornada 08-18 no tiene horas físicas nocturnas');
  assert.strictEqual(r.shiftType, 'Diurna');
});

test('calculateDetailedShift: turno con timestamps UTC equivale al turno con HH:MM', () => {
  // Mismo turno 18:00→02:00 expresado en HH:MM y como timestamps UTC.
  // Si timeToDecimal usara getHours() (TZ local), ambos resultados diferirían
  // en zonas no-UTC y la clasificación de jornada se rompería.
  const conLiteral = calculateDetailedShift('18:00', '02:00', '2026-04-15');
  const conTimestamp = calculateDetailedShift(
    '2026-04-15T18:00:00+00:00',
    '2026-04-16T02:00:00+00:00',
    '2026-04-15'
  );
  assert.deepStrictEqual(conTimestamp, conLiteral);
});

test('calculateDetailedShift: empty inputs return defaults', () => {
  const result = calculateDetailedShift('', '', '2023-10-18');
  assert.deepStrictEqual(result, { normal: 0, extraDiurna: 0, extraNocturna: 0, descanso: 0, nightHours: 0, shiftType: 'Diurna' });
});

test('calculateDetailedShift: shift crossing midnight (22:00 to 06:00)', () => {
  // Miércoles, jornada estándar nocturna 8 horas
  // Entrada 22:00 a 24:00 (2h)
  // 00:00 a 05:00 (5h)
  // 05:00 a 06:00 (1h fuera del nocturno físico)
  // Total horas: 8.
  // Horas físicas nocturnas: 7 (> 4). Por tanto toda la jornada es nocturna (bono sobre 8h).
  // Limite nocturno es 7.0 horas.
  // Por tanto: normal=7, extraDiurna=1, extraNocturna=0
  const result = calculateDetailedShift('22:00', '06:00', '2023-10-18');
  assert.deepStrictEqual(result, {
    normal: 7,
    extraDiurna: 1, // La octava hora (05:00 a 06:00) es extra, pero está fuera de (19:00 - 05:00), es diurna
    extraNocturna: 0,
    descanso: 0,
    nightHours: 7, // Bono nocturno solo sobre las 7h ordinarias nocturnas (Art. 117 LOTTT). La hora extra 05:00-06:00 es diurna.
    shiftType: 'Nocturna'
  });
});

test('calculateDetailedShift: shift crossing midnight (20:00 to 04:00)', () => {
  // Miércoles, 8 horas
  // Físicas nocturnas: 8 (toda la jornada dentro del horario nocturno)
  // Limite nocturno es 7.0 horas.
  // Extras = 1 hora (03:00 a 04:00, entra en horario nocturno)
  const result = calculateDetailedShift('20:00', '04:00', '2023-10-18');
  assert.deepStrictEqual(result, {
    normal: 7,
    extraDiurna: 0,
    extraNocturna: 1, // La hora extra ocurre de noche
    descanso: 0,
    nightHours: 8,
    shiftType: 'Nocturna'
  });
});

test('calculateDetailedShift: shift crossing midnight (18:00 to 02:00)', () => {
  // Miércoles, 8 horas (18:00 a 02:00)
  // Físicas nocturnas: 19:00 a 02:00 (7 horas)
  // Es jornada nocturna (físicas > 4).
  // Límite: 7.0
  // Extra: 1 hora, que ocurre entre 01:00 y 02:00 (es de noche).
  const result = calculateDetailedShift('18:00', '02:00', '2023-10-18');
  assert.deepStrictEqual(result, {
    normal: 7,
    extraDiurna: 0,
    extraNocturna: 1,
    descanso: 0,
    nightHours: 8,
    shiftType: 'Nocturna'
  });
});

test('calculateDetailedShift: weekend shift crossing midnight (22:00 to 06:00)', () => {
  // Domingo o Sábado (Ej: Domingo 2023-10-22)
  const result = calculateDetailedShift('22:00', '06:00', '2023-10-22');
  assert.deepStrictEqual(result, {
    normal: 0,
    extraDiurna: 0,
    extraNocturna: 0,
    descanso: 8,
    nightHours: 7, // 7 horas físicas nocturnas reales (22:00-05:00). La hora 05:00-06:00 es diurna.
    shiftType: 'Nocturna'
  });
});

test('calculateDetailedShift: standard early morning shift (04:00 to 12:00)', () => {
  // Miércoles, 8 horas (04:00 a 12:00)
  // Físicas nocturnas: 04:00 a 05:00 (1 hora)
  // Jornada mixta (0 < nocturnas <= 4)
  // Límite mixto: 7.5
  // Extra = 0.5 (11:30 a 12:00, diurna)
  const result = calculateDetailedShift('04:00', '12:00', '2023-10-18');
  assert.deepStrictEqual(result, {
    normal: 7.5,
    extraDiurna: 0.5,
    extraNocturna: 0,
    descanso: 0,
    nightHours: 1,
    shiftType: 'Mixta'
  });
});


// Tests for processAttendanceRecords

test('processAttendanceRecords: empty array returns zeroes', () => {
  const result = processAttendanceRecords([]);
  assert.deepStrictEqual(result, {
    totalNormal: 0,
    totalExtraDiurna: 0,
    totalExtraNocturna: 0,
    totalDescanso: 0,
    totalNightHours: 0,
    diasTrabajados: 0,
  });
});

test('processAttendanceRecords: ignores records with invalid state or missing times', () => {
  const asistencias: Asistencia[] = [
    { id: '1', empleado_id: 'e1', fecha: '2023-10-18', estado: 'falta' },
    { id: '2', empleado_id: 'e1', fecha: '2023-10-18', estado: 'presente', hora_entrada: '08:00' }, // missing salida
    { id: '3', empleado_id: 'e1', fecha: '2023-10-18', estado: 'presente', hora_salida: '17:00' }, // missing entrada
    { id: '4', empleado_id: 'e1', fecha: '2023-10-18', estado: 'presente', hora_entrada: '', hora_salida: '17:00' } // empty entrada
  ];

  const result = processAttendanceRecords(asistencias);
  assert.deepStrictEqual(result, {
    totalNormal: 0,
    totalExtraDiurna: 0,
    totalExtraNocturna: 0,
    totalDescanso: 0,
    totalNightHours: 0,
    diasTrabajados: 0, // No valid 'presente' records with both times
  });
});

test('processAttendanceRecords: correctly accumulates totals for a single standard shift', () => {
  const asistencias: Asistencia[] = [
    { id: '1', empleado_id: 'e1', fecha: '2023-10-18', estado: 'presente', hora_entrada: '08:00', hora_salida: '16:00' } // 8 hours diurna
  ];

  const result = processAttendanceRecords(asistencias);
  assert.deepStrictEqual(result, {
    totalNormal: 8,
    totalExtraDiurna: 0,
    totalExtraNocturna: 0,
    totalDescanso: 0,
    totalNightHours: 0,
    diasTrabajados: 1,
  });
});

// =========================================================================
// Fase 2 — Tests de correcciones LOTTT en calculatePayroll
// =========================================================================

test('calculateSeniorityYears: empleado reciente cuenta 0 años', () => {
  const hoy = new Date();
  const fechaReciente = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 10)
    .toISOString()
    .slice(0, 10);
  assert.strictEqual(calculateSeniorityYears(fechaReciente), 0);
});

test('calculateSeniorityYears: 5 años cumplidos', () => {
  assert.strictEqual(calculateSeniorityYears(yearsAgo(5)), 5);
});

// F2.1: Bono vacacional (Art. 192 LOTTT)
test('F2.1 bono vacacional: año 0 = 15 días base', () => {
  const hoy = new Date();
  const reciente = new Date(hoy.getFullYear(), hoy.getMonth() - 6, hoy.getDate())
    .toISOString()
    .slice(0, 10);
  const r = calculatePayroll(mkEmpleado({ fecha_ingreso: reciente }), mkConfig(), 15, 'Q1');
  assert.strictEqual(r.anios_servicio, 0);
  assert.strictEqual(r.dias_vacaciones_anuales, 15);
});

test('F2.1 bono vacacional: año 1 = 16 días (base + 1 por año servicio, sin -1 offset)', () => {
  const r = calculatePayroll(mkEmpleado({ fecha_ingreso: yearsAgo(1) }), mkConfig(), 15, 'Q1');
  assert.strictEqual(r.anios_servicio, 1);
  assert.strictEqual(r.dias_vacaciones_anuales, 16);
});

test('F2.1 bono vacacional: tope 30 días a los 15+ años', () => {
  const r = calculatePayroll(mkEmpleado({ fecha_ingreso: yearsAgo(20) }), mkConfig(), 15, 'Q1');
  assert.strictEqual(r.dias_vacaciones_anuales, 30);
});

// F2.6: Utilidades clamp (Art. 131 LOTTT)
test('F2.6 utilidades: clamp a 30 si config es menor', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig({ dias_utilidades: 10 }), 15, 'Q1');
  assert.strictEqual(r.dias_utilidades_anuales, 30);
});

test('F2.6 utilidades: clamp a 120 si config es mayor', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig({ dias_utilidades: 180 }), 15, 'Q1');
  assert.strictEqual(r.dias_utilidades_anuales, 120);
});

test('F2.6 utilidades: respeta valor dentro del rango', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig({ dias_utilidades: 60 }), 15, 'Q1');
  assert.strictEqual(r.dias_utilidades_anuales, 60);
});

// F2.4: FAOV sobre salario integral (Art. 30 Ley Vivienda)
test('F2.4 FAOV: se calcula sobre salario integral, no solo sobre earnings normal', () => {
  const emp = mkEmpleado({ salario_usd: 100 }); // 10000 VEF/mes
  const r = calculatePayroll(emp, mkConfig(), 15, 'Q1');
  // salarioDiarioNormal ≈ 333.33
  // alicBV = 333.33 * 15 / 360 ≈ 13.889
  // alicUtil = 333.33 * 60 / 360 ≈ 55.556
  // integral ≈ 402.78
  // FAOV 15d = 402.78 * 15 * 0.01 ≈ 60.417
  assert.ok(r.deduccion_faov > 60 && r.deduccion_faov < 61,
    `FAOV esperado ~60.42, obtenido ${r.deduccion_faov}`);
});

// Sin horario asignado: deducciones obligatorias siguen vigentes
test('deducciones se calculan sobre salario base si earnings es 0 (sin horario asignado)', () => {
  const emp = mkEmpleado({ salario_usd: 100 }); // 10000 VEF/mes => 5000/quincena
  const r = calculatePayroll(emp, mkConfig(), 15, 'Q1', 0);
  // Con earnings=0 cae a sueldoPeriodoVef = 5000.
  // Tope IVSS prorrateado a quincena = (130*5/30)*15 = 325; min(5000,325)=325.
  // IVSS = 325*0.04 = 13; SPF = 325*0.005 = 1.625.
  // FAOV se calcula sobre integral, no se topea.
  assert.ok(r.deduccion_ivss > 0, 'IVSS debe aparecer aunque no haya horario');
  assert.ok(r.deduccion_spf > 0, 'SPF debe aparecer aunque no haya horario');
  assert.ok(r.deduccion_faov > 0, 'FAOV debe aparecer aunque no haya horario');
  assert.ok(Math.abs(r.deduccion_ivss - 13) < 0.01, `IVSS esperado 13, obtenido ${r.deduccion_ivss}`);
});

// F2.5: IVSS tope (Art. 59 LSS)
test('F2.5 IVSS: aplica tope de 5 SM mensuales prorrateados', () => {
  const config = mkConfig({ salario_minimo_vef: 130 }); // tope mensual = 650
  const empAlto = mkEmpleado({ salario_base_vef: 100000 });
  const r = calculatePayroll(empAlto, config, 15, 'Q1');
  // baseImponible = 650/30 * 15 = 325
  // IVSS = 325 * 0.04 = 13
  assert.ok(Math.abs(r.deduccion_ivss - 13) < 0.01,
    `IVSS esperado 13, obtenido ${r.deduccion_ivss}`);
  assert.ok(Math.abs(r.deduccion_spf - 325 * 0.005) < 0.01);
});

// F2.3: Prorateo cestaticket
test('F2.3 cestaticket: Q1 no paga', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig(), 15, 'Q1');
  assert.strictEqual(r.bono_alimentacion_vef, 0);
});

test('F2.3 cestaticket: Q2 paga completo sin faltas', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig(), 15, 'Q2');
  assert.strictEqual(r.bono_alimentacion_vef, 40 * 100);
});

test('F2.3 cestaticket: Q2 con 3 faltas injustificadas descuenta 10%', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig(), 15, 'Q2', undefined, {
    faltasInjustificadas: 3,
  });
  assert.strictEqual(r.bono_alimentacion_vef, 3600); // 4000 * 0.9
});

test('F2.3 cestaticket: faltas extremas no genera valor negativo', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig(), 15, 'Q2', undefined, {
    faltasInjustificadas: 50,
  });
  assert.strictEqual(r.bono_alimentacion_vef, 0);
});

test('F2.3 cestaticket: omitirCestaticket fuerza 0 aún en Q2', () => {
  const r = calculatePayroll(mkEmpleado(), mkConfig(), 15, 'Q2', undefined, {
    omitirCestaticket: true,
  });
  assert.strictEqual(r.bono_alimentacion_vef, 0);
});

// F2.2: calculateLOTTTEarnings — centralización de recargos Arts. 117/118/120
test('F2.2 calculateLOTTTEarnings: sumatoria correcta de componentes', () => {
  const emp = mkEmpleado({ salario_usd: 300 }); // 30000/mes → 1000/día → 125/h
  const r = calculateLOTTTEarnings(emp, mkConfig(), {
    diasTrabajados: 12,
    totalExtraDiurna: 2,
    totalExtraNocturna: 1,
    totalNightHours: 4,
    horasJornadaMixta: 2,
    domingoLaborado: 1,
    descansoLaborado: 0,
    feriadoLaborado: 0,
    sabadoLaborado: 0,
  });
  assert.strictEqual(r.salario_diario, 1000);
  assert.strictEqual(r.salario_hora, 125);
  assert.strictEqual(r.dias_laborados, 12000);
  assert.strictEqual(r.domingo_laborado, 1500);        // 1 * 1000 * 1.5
  assert.strictEqual(r.hora_extra_diurna, 375);         // 2 * 125 * 1.5
  assert.strictEqual(r.hora_extra_nocturna, 243.75);    // 1 * 125 * 1.95
  assert.strictEqual(r.bono_nocturno, 150);             // 4 * 125 * 0.3
  assert.strictEqual(r.bono_jornada_mixta, 75);         // 2 * 125 * 0.3
});

test('F2.2 LOTTT_RECARGOS: constantes coinciden con ley', () => {
  assert.strictEqual(LOTTT_RECARGOS.BONO_NOCTURNO, 0.30);
  assert.strictEqual(LOTTT_RECARGOS.HORA_EXTRA_DIURNA, 1.50);
  assert.strictEqual(LOTTT_RECARGOS.HORA_EXTRA_NOCTURNA, 1.95);
  assert.strictEqual(LOTTT_RECARGOS.DIA_DESCANSO_LABORADO, 1.50);
  assert.strictEqual(LOTTT_RECARGOS.DIA_DOMINGO_LABORADO, 1.50);
  assert.strictEqual(LOTTT_RECARGOS.DIA_FERIADO_LABORADO, 1.50);
});

// =========================================================================
// Fin tests Fase 2
// =========================================================================

test('processAttendanceRecords: correctly accumulates totals across multiple shifts and distinct days', () => {
  const asistencias: Asistencia[] = [
    // Wed: 8 hours diurna (08:00 - 16:00)
    { id: '1', empleado_id: 'e1', fecha: '2023-10-18', estado: 'presente', hora_entrada: '08:00', hora_salida: '16:00' },
    // Thu: 10 hours mixed (04:00 - 14:00) -> 1h night, limit 7.5, extra 2.5 diurna
    { id: '2', empleado_id: 'e1', fecha: '2023-10-19', estado: 'presente', hora_entrada: '04:00', hora_salida: '14:00' },
    // Thu again (same day, distinct shift): 2 hours diurna (15:00 - 17:00)
    { id: '3', empleado_id: 'e1', fecha: '2023-10-19', estado: 'presente', hora_entrada: '15:00', hora_salida: '17:00' },
  ];

  const result = processAttendanceRecords(asistencias);

  // Wed: normal=8, extraDiurna=0, extraNocturna=0, descanso=0, nightHours=0
  // Thu (shift 1): normal=7.5, extraDiurna=2.5, extraNocturna=0, descanso=0, nightHours=1
  // Thu (shift 2): normal=2, extraDiurna=0, extraNocturna=0, descanso=0, nightHours=0
  // Totals: normal = 8 + 7.5 + 2 = 17.5
  // Totals: extraDiurna = 0 + 2.5 + 0 = 2.5
  // Totals: nightHours = 0 + 1 + 0 = 1
  // diasTrabajados: 2 unique days ('2023-10-18', '2023-10-19')

  assert.deepStrictEqual(result, {
    totalNormal: 17.5,
    totalExtraDiurna: 2.5,
    totalExtraNocturna: 0,
    totalDescanso: 0,
    totalNightHours: 1,
    diasTrabajados: 2,
  });
});
