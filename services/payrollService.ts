
import type { ConfigGlobal, Empleado, Asistencia } from '../types.ts';

// Constantes Legales LOTTT
const TOPE_IVSS_SALARIOS_MINIMOS = 5;
const TOPE_SPF_SALARIOS_MINIMOS = 10; 

const LIMIT_DIURNAL = 8.0;
const LIMIT_MIXED = 7.5;
const LIMIT_NOCTURNAL = 7.0;

const NIGHT_START = 19.0; // 7:00 PM
const NIGHT_END = 5.0;   // 5:00 AM (Día siguiente)

/**
 * Convierte formato HH:MM o ISO String a decimal (Ej: "08:30" o "2026-03-12T08:30:00Z" -> 8.5)
 */
export const timeToDecimal = (timeStr: string): number => {
  if (!timeStr) return 0;
  
  // Si es un ISO String (contiene 'T')
  if (timeStr.includes('T')) {
    const date = new Date(timeStr);
    // Usamos hora local del sistema para coincidir con la entrada del usuario
    return date.getHours() + (date.getMinutes() / 60);
  }

  if (timeStr === '23:59') return 24.0;
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m / 60);
};

/**
 * Determina el solapamiento entre dos rangos de tiempo
 */
const getOverlap = (start1: number, end1: number, start2: number, end2: number) => {
  return Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
};

/**
 * Analiza un turno individual según LOTTT Art. 173 y 117.
 * detecta automáticamente si es Diurna, Mixta o Nocturna.
 */
export const calculateDetailedShift = (entrada: string, salida: string, fecha: string) => {
  if (!entrada || !salida) return { normal: 0, extraDiurna: 0, extraNocturna: 0, descanso: 0, nightHours: 0, shiftType: 'Diurna' };

  let start = timeToDecimal(entrada);
  let end = timeToDecimal(salida);
  let duration = 0;
  
  // Manejo de turno con ISO Strings (Precisión máxima)
  if (entrada.includes('T') && salida.includes('T')) {
    const d1 = new Date(entrada);
    const d2 = new Date(salida);
    const diffMs = d2.getTime() - d1.getTime();
    duration = Math.max(0, diffMs / (1000 * 60 * 60));
    // Ajustamos 'end' para que las funciones de solapamiento funcionen bien (ej: 25h si pasó medianoche)
    end = start + duration;
  } else {
    // Formato HH:MM antiguo o mixto
    if (end < start) end += 24; 
    duration = end - start;
  }
  const dateObj = new Date(fecha);
  const day = dateObj.getUTCDay(); // 0 Dom, 6 Sab — UTC evita desfase de timezone
  const isWeekend = day === 0 || day === 6;

  // 1. Calcular horas físicas nocturnas reales (entre 19:00 y 05:00)
  // Bloque A: 19:00 a 24:00 (Mismo día)
  const nightPhys1 = getOverlap(start, end, 19, 24);
  // Bloque B: 24:00 a 29:00 (00:00 a 05:00 día siguiente)
  const nightPhys2 = getOverlap(start, end, 24, 29);
  // Bloque C: 00:00 a 05:00 (Mismo día, si entró muy temprano)
  const nightPhys3 = getOverlap(start, end, 0, 5);

  const realNightHours = nightPhys1 + nightPhys2 + nightPhys3;

  // 2. Determinar tipo de Jornada (Art 173 LOTTT)
  let shiftType: 'Diurna' | 'Mixta' | 'Nocturna' = 'Diurna';
  let dailyLimit = LIMIT_DIURNAL;

  if (realNightHours >= 4) {
    shiftType = 'Nocturna';
    dailyLimit = LIMIT_NOCTURNAL; // Art. 173: jornada nocturna límite 7h
  } else if (realNightHours > 0) {
    shiftType = 'Mixta';
    dailyLimit = LIMIT_MIXED;
  }

  // 3. Desglose Normal vs Extra según el límite de su tipo de jornada
  let normal = 0;
  let extraDiurna = 0;
  let extraNocturna = 0;

  if (duration <= dailyLimit) {
    normal = duration;
  } else {
    normal = dailyLimit;
    const extraDuration = duration - dailyLimit;

    // Las extras se clasifican por el momento real del reloj en que ocurren
    const extraStart = start + dailyLimit;
    const extraEnd = end;

    const extraNight1 = getOverlap(extraStart, extraEnd, 19, 24);
    const extraNight2 = getOverlap(extraStart, extraEnd, 24, 29); // 00:00-05:00 día siguiente
    const extraNight3 = getOverlap(extraStart, extraEnd, 0, 5);   // 00:00-05:00 mismo día

    extraNocturna = extraNight1 + extraNight2 + extraNight3;
    extraDiurna = Math.max(0, extraDuration - extraNocturna);
  }

  // 4. Calcular horas con bono nocturno (Art. 117 LOTTT)
  // Jornada Nocturna: bono solo sobre las 7h ordinarias + las extras que caen en bloque nocturno.
  //   NO se paga bono nocturno a las extras diurnas (05:00-07:00pm) aunque la jornada sea nocturna.
  // Jornada Mixta/Diurna: bono solo sobre las horas físicas reales dentro del bloque 19:00-05:00.
  let paidNightHours: number;
  if (shiftType === 'Nocturna') {
    paidNightHours = normal + extraNocturna; // Ej: 7 + 4 = 11h para 18:00→08:00 (NO las 3h de 05:00-08:00)
  } else {
    paidNightHours = realNightHours;
  }

  // 5. Caso especial Sábado/Domingo: todas las horas son "descanso laborado"
  if (isWeekend) {
    return { normal: 0, extraDiurna: 0, extraNocturna: 0, descanso: duration, nightHours: paidNightHours, shiftType };
  }

  return { normal, extraDiurna, extraNocturna, descanso: 0, nightHours: paidNightHours, shiftType };
};

/**
 * Procesa un array de asistencias y devuelve los totales acumulados
 */
export const processAttendanceRecords = (asistencias: Asistencia[]) => {
  let totalNormal = 0;
  let totalExtraDiurna = 0;
  let totalExtraNocturna = 0;
  let totalDescanso = 0;
  let totalNightHours = 0; 
  
  // Para contar días trabajados únicos, usamos un Set de fechas
  const diasUnicos = new Set<string>();

  asistencias.forEach(att => {
    if (att.estado === 'presente' && att.hora_entrada && att.hora_salida) {
      // Usamos la fecha del registro como el día trabajado
      diasUnicos.add(att.fecha);

      const breakdown = calculateDetailedShift(att.hora_entrada, att.hora_salida, att.fecha);
      totalNormal += breakdown.normal;
      totalExtraDiurna += breakdown.extraDiurna;
      totalExtraNocturna += breakdown.extraNocturna;
      totalDescanso += breakdown.descanso;
      totalNightHours += breakdown.nightHours;
    }
  });

  return { 
    totalNormal, 
    totalExtraDiurna, 
    totalExtraNocturna, 
    totalDescanso, 
    totalNightHours, 
    diasTrabajados: diasUnicos.size 
  };
};

export const calculateSeniorityYears = (fechaIngreso: string): number => {
  const ingreso = new Date(fechaIngreso);
  const hoy = new Date();
  let anios = hoy.getFullYear() - ingreso.getFullYear();
  const m = hoy.getMonth() - ingreso.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < ingreso.getDate())) {
    anios--;
  }
  return anios < 0 ? 0 : anios;
};

export const calculatePayroll = (
  empleado: Empleado,
  config: ConfigGlobal,
  diasTrabajados: number = 15, // Por defecto quincenal
  periodo: 'Q1' | 'Q2' = 'Q1',
  earnings?: number
) => {
  const tasa = config.tasa_bcv;
  const sueldoMensualVef = empleado.salario_base_vef > 0 
    ? empleado.salario_base_vef 
    : (empleado.salario_usd * tasa);
  const salarioDiarioNormal = sueldoMensualVef / 30;
  const sueldoPeriodoVef = salarioDiarioNormal * diasTrabajados;

  const aniosServicio = calculateSeniorityYears(empleado.fecha_ingreso);
  const diasBonoVacacional = Math.min(30, config.dias_bono_vacacional_base + Math.max(0, aniosServicio - 1));
  const diasUtilidades = config.dias_utilidades;

  const alicuotaBonoVacacionalDiaria = (salarioDiarioNormal * diasBonoVacacional) / 360;
  const alicuotaUtilidadesDiaria = (salarioDiarioNormal * diasUtilidades) / 360;
  const salarioDiarioIntegral = salarioDiarioNormal + alicuotaBonoVacacionalDiaria + alicuotaUtilidadesDiaria;

  const salarioMinimo = config.salario_minimo_vef;
  const topeIvss = salarioMinimo * TOPE_IVSS_SALARIOS_MINIMOS;
  const baseCalculo = earnings !== undefined ? earnings : sueldoPeriodoVef;
  
  let deduccionIvss = 0;
  let deduccionSpf = 0;
  let deduccionFaov = 0;

  if (baseCalculo > 0) {
    const baseImponiblePeriodo = Math.min(baseCalculo, (topeIvss / 30) * diasTrabajados);
    deduccionIvss = baseImponiblePeriodo * 0.04;
    deduccionSpf = baseImponiblePeriodo * 0.005;
    deduccionFaov = baseCalculo * 0.01;
  }

  const cestaticketMensualVef = config.cestaticket_usd * tasa;
  const bonoAlimentacionVef = periodo === 'Q2' ? cestaticketMensualVef : 0;

  const totalDeducciones = deduccionIvss + deduccionSpf + deduccionFaov;
  const netoPagarVef = baseCalculo + bonoAlimentacionVef - totalDeducciones;

  return {
    anios_servicio: aniosServicio,
    salario_diario_normal: salarioDiarioNormal,
    salario_diario_integral: salarioDiarioIntegral,
    alicuota_utilidades_diaria: alicuotaUtilidadesDiaria,
    alicuota_vacaciones_diaria: alicuotaBonoVacacionalDiaria,
    dias_utilidades_anuales: diasUtilidades,
    dias_vacaciones_anuales: diasBonoVacacional,
    sueldo_base_mensual: sueldoMensualVef,
    sueldo_periodo: sueldoPeriodoVef,
    bono_alimentacion_vef: bonoAlimentacionVef,
    deduccion_ivss: deduccionIvss,
    deduccion_faov: deduccionFaov,
    deduccion_spf: deduccionSpf,
    neto_pagar_vef: netoPagarVef,
    total_deducciones: totalDeducciones
  };
};

export const fetchBcvRate = async (): Promise<number> => {
  try {
    const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!response.ok) throw new Error('API response not ok');
    const data = await response.json();
    
    // El API de ve.dolarapi.com devuelve el campo 'promedio' para la tasa oficial
    const rate = data.promedio || data.price || data.valor;
    
    if (!rate || isNaN(rate)) {
      throw new Error('Invalid rate format');
    }
    
    return rate;
  } catch (error) {
    console.error("Error fetching BCV rate:", error);
    // Intentar un fallback si falla el principal (opcional, por ahora retornamos un valor seguro o el actual)
    return 0; // Retornamos 0 para indicar que falló y manejarlo arriba
  }
};
