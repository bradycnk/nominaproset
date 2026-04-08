
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase.ts';
import { Empleado, Asistencia } from '../types.ts';
import { calculateDetailedShift } from '../services/payrollService.ts';

interface CalendarDayDraft {
  id?: string;
  estado: Asistencia['estado'];
  hora_entrada: string;
  hora_salida: string;
  observaciones: string;
}

interface HolidayInfo {
  name: string;
  detail: string;
}

const pad2 = (value: number) => String(value).padStart(2, '0');
const formatDateKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const getEasterSunday = (year: number) => {
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

const getVenezuelanHolidays = (year: number): Record<string, HolidayInfo> => {
  const holidays: Record<string, HolidayInfo> = {};

  const addHoliday = (date: Date, name: string, detail: string) => {
    holidays[formatDateKey(date)] = { name, detail };
  };

  // Feriados fijos de uso nacional
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

  // Feriados móviles (basados en Pascua)
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

const AttendanceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'daily' | 'calendar'>('daily');
  const [employees, setEmployees] = useState<Empleado[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  
  // Estado para el formulario (Inputs)
  const [attendances, setAttendances] = useState<Record<string, Asistencia>>({});
  // Estado para la base de datos (Confirmación real)
  const [savedAttendances, setSavedAttendances] = useState<Record<string, Asistencia>>({});
  
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Estados para Calendario / Histórico
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [employeeHistory, setEmployeeHistory] = useState<Asistencia[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dayDraft, setDayDraft] = useState<CalendarDayDraft>({
    estado: 'presente',
    hora_entrada: '',
    hora_salida: '',
    observaciones: ''
  });
  const [savingCalendarDay, setSavingCalendarDay] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const holidaysByDate = useMemo(() => getVenezuelanHolidays(selectedYear), [selectedYear]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'calendar' && selectedEmployeeId) {
      fetchEmployeeHistory();
    }
  }, [selectedEmployeeId, selectedMonth, selectedYear, activeTab]);

  useEffect(() => {
    setSelectedDate('');
    setDayDraft({
      estado: 'presente',
      hora_entrada: '',
      hora_salida: '',
      observaciones: ''
    });
  }, [selectedEmployeeId, selectedMonth, selectedYear]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: brData } = await supabase.from('sucursales').select('id, nombre_id').order('nombre_id');
      if (brData) setBranches(brData);

      const { data: empData } = await supabase
        .from('empleados')
        .select('*, sucursales(nombre_id)')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      // Buscamos asistencias de hoy O turnos que sigan abiertos (sin salida)
      const { data: attData } = await supabase
        .from('asistencias')
        .select('*')
        .or(`fecha.eq.${today},hora_salida.is.null`);

      setEmployees(empData || []);
      if (empData && empData.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(empData[0].id);
      }
      
      const attMap: Record<string, Asistencia> = {};
      attData?.forEach(a => {
        // Si hay varios turnos para el mismo empleado, priorizamos el abierto (sin salida)
        if (!attMap[a.empleado_id] || !a.hora_salida) {
          attMap[a.empleado_id] = a;
        }
      });
      
      setAttendances(prev => ({ ...attMap }));
      setSavedAttendances(JSON.parse(JSON.stringify(attMap))); 

    } catch (err) {
      console.error("Error cargando asistencia:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeHistory = async () => {
    const startDate = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
    const endDate = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('asistencias')
      .select('*')
      .eq('empleado_id', selectedEmployeeId)
      .gte('fecha', startDate)
      .lte('fecha', endDate);

    const history = data || [];
    setEmployeeHistory(history);
    return history;
  };

  const getHistoryRecordsByDate = (date: string) => {
    return employeeHistory.filter((record) => record.fecha === date);
  };

  const openDayEditor = (date: string, recordId?: string) => {
    const records = getHistoryRecordsByDate(date);
    const record = recordId ? records.find(r => r.id === recordId) : records[0];
    
    setSelectedDate(date);
    setDayDraft({
      id: record?.id,
      estado: record?.estado || 'presente',
      hora_entrada: record?.hora_entrada && record.hora_entrada.includes('T') ? record.hora_entrada.split('T')[1].slice(0, 5) : (record?.hora_entrada || ''),
      hora_salida: record?.hora_salida && record.hora_salida.includes('T') ? record.hora_salida.split('T')[1].slice(0, 5) : (record?.hora_salida || ''),
      observaciones: record?.observaciones || ''
    });
  };

  const deleteDay = async () => {
    if (!dayDraft.id) return;
    if (!window.confirm("¿Está seguro de eliminar este registro de asistencia? Esta acción no se puede deshacer.")) return;

    setSavingCalendarDay(true);
    try {
      const { error } = await supabase
        .from('asistencias')
        .delete()
        .eq('id', dayDraft.id);

      if (error) throw error;

      await fetchInitialData();
      await fetchEmployeeHistory();
      setDayDraft({ id: undefined, estado: 'presente', hora_entrada: '', hora_salida: '', observaciones: '' });
      alert("Registro eliminado exitosamente.");
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    } finally {
      setSavingCalendarDay(false);
    }
  };

  const saveCalendarDay = async () => {
    if (!selectedEmployeeId || !selectedDate) return;

    const records = getHistoryRecordsByDate(selectedDate);
    const existingRecord = dayDraft.id ? records.find(r => r.id === dayDraft.id) : null;
    
    if (existingRecord?.cerrado) {
      alert("El día seleccionado está cerrado administrativamente. No se puede editar.");
      return;
    }

    if (dayDraft.estado === 'presente' && !dayDraft.hora_entrada) {
      alert("Para estado 'presente' debe indicar hora de entrada.");
      return;
    }

    if (dayDraft.hora_salida && !dayDraft.hora_entrada) {
      alert("No puede guardar hora de salida sin una hora de entrada.");
      return;
    }


    setSavingCalendarDay(true);
    try {
      const obs = dayDraft.observaciones.trim();

      const payload = {
        empleado_id: selectedEmployeeId,
        fecha: selectedDate,
        estado: dayDraft.estado,
        hora_entrada: dayDraft.estado === 'presente' && dayDraft.hora_entrada 
          ? `${selectedDate}T${dayDraft.hora_entrada}:00` 
          : null,
        hora_salida: dayDraft.estado === 'presente' && dayDraft.hora_salida 
          ? (dayDraft.hora_salida < dayDraft.hora_entrada 
              ? `${new Date(new Date(selectedDate).getTime() + 86400000).toISOString().split('T')[0]}T${dayDraft.hora_salida}:00`
              : `${selectedDate}T${dayDraft.hora_salida}:00`)
          : null,
        observaciones: obs || null,
      };

      if (dayDraft.id) {
        const { error } = await supabase
          .from('asistencias')
          .update(payload)
          .eq('id', dayDraft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('asistencias')
          .insert(payload);
        if (error) throw error;
      }

      const refreshedHistory = await fetchEmployeeHistory();

      if (selectedDate === today) await fetchInitialData();
      const recordsUpdated = refreshedHistory.filter((record) => record.fecha === selectedDate);
      
      // Intentamos seleccionar el mismo que editamos o el nuevo
      const recordToShow = dayDraft.id 
        ? recordsUpdated.find(r => r.id === dayDraft.id) 
        : recordsUpdated.sort((a,b) => b.id.localeCompare(a.id))[0]; // Heuristic for last inserted

      setDayDraft({
        id: recordToShow?.id,
        estado: recordToShow?.estado || 'presente',
        hora_entrada: recordToShow?.hora_entrada && recordToShow.hora_entrada.includes('T') ? recordToShow.hora_entrada.split('T')[1].slice(0, 5) : (recordToShow?.hora_entrada || ''),
        hora_salida: recordToShow?.hora_salida && recordToShow.hora_salida.includes('T') ? recordToShow.hora_salida.split('T')[1].slice(0, 5) : (recordToShow?.hora_salida || ''),
        observaciones: recordToShow?.observaciones || ''
      });
    } catch (err: any) {
      alert("Error al guardar cambios del día: " + err.message);
    } finally {
      setSavingCalendarDay(false);
    }
  };

  const handleTimeChange = (empId: string, field: 'hora_entrada' | 'hora_salida', value: string) => {
    setAttendances(prev => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || { 
          empleado_id: empId, 
          fecha: today, 
          estado: 'presente' 
        } as Asistencia),
        [field]: value
      }
    }));
  };

  const saveEntry = async (empId: string) => {
    const savedData = savedAttendances[empId];
    if (savedData?.id && !savedData.hora_salida) return alert("Ya existe un turno abierto para este empleado.");

    const data = attendances[empId];
    if (!data?.hora_entrada) return alert("Ingrese la hora de entrada");

    setProcessingId(empId);
    try {
      const payload = {
        empleado_id: empId,
        fecha: today,
        hora_entrada: `${today}T${data.hora_entrada}:00`,
        estado: 'presente' as const
      };

      const { error } = await supabase
        .from('asistencias')
        .insert(payload);

      if (error) throw error;
      await fetchInitialData();
    } catch (err: any) {
      alert("Error al guardar entrada: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const saveExit = async (empId: string) => {
    const savedData = savedAttendances[empId];
    if (savedData?.cerrado) return alert("El día ya está cerrado administrativamente. No se pueden hacer cambios.");
    if (!savedData?.id || !savedData.hora_entrada) return alert("Error: No hay un turno abierto registrado.");
    
    const data = attendances[empId];
    if (!data?.hora_salida) return alert("Ingrese la hora de salida");

    setProcessingId(empId);
    try {
      // Determinamos si la salida es del día siguiente (si es menor a la entrada)
      // O usamos la fecha de hoy.
      const horaEntradaStr = typeof savedData.hora_entrada === 'string' ? savedData.hora_entrada : '';
      const [hEnt] = (horaEntradaStr.includes('T') ? horaEntradaStr.split('T')[1] : horaEntradaStr).split(':');
      const [hSal] = data.hora_salida.split(':');
      
      let fechaSalida = today;
      if (parseInt(hSal) < parseInt(hEnt)) {
          const tomorro = new Date();
          tomorro.setDate(tomorro.getDate() + 1);
          fechaSalida = tomorro.toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('asistencias')
        .update({ 
          hora_salida: `${fechaSalida}T${data.hora_salida}:00` 
        })
        .eq('id', savedData.id);

      if (error) throw error;
      await fetchInitialData();
    } catch (err: any) {
      alert("Error al guardar salida: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCloseQuincena = async (isSecondHalf: boolean) => {
    const startDay = isSecondHalf ? 16 : 1;
    const endDay = isSecondHalf ? new Date(selectedYear, selectedMonth + 1, 0).getDate() : 15;
    
    const startDate = new Date(selectedYear, selectedMonth, startDay).toISOString().split('T')[0];
    const endDate = new Date(selectedYear, selectedMonth, endDay).toISOString().split('T')[0];

    const now = new Date();
    const rangeEnd = new Date(selectedYear, selectedMonth, endDay);
    if (rangeEnd > now && !confirm("¡Atención! Está intentando cerrar una quincena que aún no ha terminado. ¿Desea continuar?")) {
      return;
    }

    if (!confirm(`¿Confirma el CIERRE DE QUINCENA para el empleado seleccionado?\n\nPeríodo: ${startDate} al ${endDate}\n\nEsta acción bloqueará la edición de estos registros.`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('asistencias')
        .update({ cerrado: true })
        .eq('empleado_id', selectedEmployeeId)
        .gte('fecha', startDate)
        .lte('fecha', endDate);

      if (error) throw error;

      alert("Quincena cerrada correctamente. Registros bloqueados.");
      fetchEmployeeHistory();
    } catch (err: any) {
      alert("Error al cerrar quincena: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Funciones para Calendario LOTTT ---

  const getDaysInMonth = (month: number, year: number) => {
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const calculateHoursWorked = (entrada?: string, salida?: string, fecha?: string) => {
    if (!entrada || !salida) return 0;
    
    // Usamos el servicio compartido para asegurar que el cálculo sea idéntico al del calendario
    const details = calculateDetailedShift(entrada, salida, fecha || today);
    return details.normal + details.extraDiurna + details.extraNocturna + details.descanso;
  };

  const formatDisplayTime = (time?: string) => {
    if (!time) return '--:--';
    if (time.includes('T')) {
      return new Date(time).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return time.slice(0, 5);
  };

  const applyQuickTime = (field: 'hora_entrada' | 'hora_salida', value: string) => {
    setDayDraft((prev) => ({ ...prev, [field]: value }));
  };

  // Devuelve indicador AM/PM con período del día para una hora HH:MM
  const getAmPmBadge = (time?: string) => {
    if (!time || time === '--:--') return null;
    const raw = time.includes('T')
      ? new Date(time).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false })
      : time.slice(0, 5);
    const h = parseInt(raw.slice(0, 2));
    if (isNaN(h)) return null;
    const ampm = h < 12 ? 'AM' : 'PM';
    if (h >= 0  && h < 6)  return { ampm, label: 'Madrugada', icon: '🌄', color: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (h >= 6  && h < 12) return { ampm, label: 'Mañana',    icon: '☀️',  color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    if (h === 12)           return { ampm, label: 'Mediodía',  icon: '🌤️', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (h >= 13 && h < 19) return { ampm, label: 'Tarde',     icon: '🌇',  color: 'bg-orange-100 text-orange-700 border-orange-200' };
    return                         { ampm, label: 'Noche',     icon: '🌙',  color: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
  };

  // Clasifica el turno según la hora de entrada y el tipo LOTTT
  const getShiftBadge = (horaEntrada?: string, horaSalida?: string, fecha?: string) => {
    if (!horaEntrada) return null;
    const h = horaEntrada.includes('T')
      ? new Date(horaEntrada).getHours()
      : parseInt(horaEntrada.slice(0, 2));

    // Si tenemos salida, usamos el tipo LOTTT calculado
    if (horaSalida && fecha) {
      const details = calculateDetailedShift(horaEntrada, horaSalida, fecha);
      if (details.shiftType === 'Nocturna') {
        return { label: 'Nocturna', icon: '🌙', color: 'bg-indigo-100 text-indigo-700 border border-indigo-200' };
      }
      if (details.shiftType === 'Mixta') {
        return { label: 'Mixta', icon: '🌆', color: 'bg-amber-100 text-amber-700 border border-amber-200' };
      }
    }

    // Clasificación por hora de entrada
    if (h >= 0 && h < 6)  return { label: 'Madrugada', icon: '🌄', color: 'bg-purple-100 text-purple-700 border border-purple-200' };
    if (h >= 6 && h < 13) return { label: 'Diurna',    icon: '☀️',  color: 'bg-yellow-100 text-yellow-700 border border-yellow-200' };
    if (h >= 13 && h < 19) return { label: 'Tarde',    icon: '🌇',  color: 'bg-orange-100 text-orange-700 border border-orange-200' };
    return                         { label: 'Nocturna', icon: '🌙',  color: 'bg-indigo-100 text-indigo-700 border border-indigo-200' };
  };

  const getStatsQuincena = (isSecondHalf: boolean) => {
    const startDay = isSecondHalf ? 16 : 1;
    const endDay = isSecondHalf ? 31 : 15;
    
    const relevantHistory = employeeHistory.filter(h => {
      const day = parseInt(h.fecha.split('-')[2]);
      return day >= startDay && day <= endDay;
    });

    let totalHours = 0;
    let daysWorked = 0;
    let inasistencias = 0;
    let isClosed = false;

    const daysWithAttendance = new Set<string>();
    const daysWithFalta = new Set<string>();

    relevantHistory.forEach(h => {
      if (h.estado === 'presente') {
        totalHours += calculateHoursWorked(h.hora_entrada, h.hora_salida, h.fecha);
        daysWithAttendance.add(h.fecha);
      } else if (h.estado === 'falta') {
        daysWithFalta.add(h.fecha);
      }
      if (h.cerrado) isClosed = true;
    });

    daysWorked = daysWithAttendance.size;
    inasistencias = daysWithFalta.size;

    return { totalHours, daysWorked, inasistencias, isClosed };
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    
    const firstDayIndex = daysInMonth[0].getDay();
    const blanks = Array(firstDayIndex).fill(null);

    return (
      <div className="grid grid-cols-7 gap-2 mb-6 md:gap-3">
        {weekDays.map(d => (
          <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest py-2 ${d === 'Dom' ? 'text-rose-400' : 'text-slate-400'}`}>
            {d}
          </div>
        ))}
        
        {blanks.map((_, i) => <div key={`blank-${i}`} className="h-20 bg-transparent md:h-28"></div>)}

        {daysInMonth.map(date => {
          const dateStr = date.toISOString().split('T')[0];
          const records = employeeHistory.filter(h => h.fecha === dateStr);
          const holiday = holidaysByDate[dateStr];
          const isHoliday = !!holiday;
          const isSunday = date.getDay() === 0;
          const isSelectedDay = selectedDate === dateStr;

          let totalHoursDay = 0;
          let hasExtras = false;
          let hasPresent = false;
          let hasFalta = false;
          let hasReposo = false;
          let hasVacaciones = false;
          let dominantShiftBadge: { label: string; icon: string; color: string } | null = null;

          records.forEach(r => {
            if (r.estado === 'presente') {
              hasPresent = true;
              const details = calculateDetailedShift(r.hora_entrada || '', r.hora_salida || '', dateStr);
              totalHoursDay += details.normal + details.extraDiurna + details.extraNocturna + details.descanso;
              if (details.extraDiurna + details.extraNocturna > 0) hasExtras = true;
              const badge = getShiftBadge(r.hora_entrada, r.hora_salida, dateStr);
              if (badge && !dominantShiftBadge) dominantShiftBadge = badge;
            } else if (r.estado === 'falta') hasFalta = true;
            else if (r.estado === 'reposo') hasReposo = true;
            else if (r.estado === 'vacaciones') hasVacaciones = true;
          });

          let bgColor = 'bg-white';
          let borderColor = 'border-slate-100';

          if (isHoliday) {
            bgColor = 'bg-orange-50';
            borderColor = 'border-orange-200';
          } else if (hasPresent) {
            bgColor = isSunday ? 'bg-amber-50' : 'bg-emerald-50';
            borderColor = isSunday ? 'border-amber-200' : 'border-emerald-200';
          } else if (hasFalta) {
            bgColor = 'bg-rose-50';
            borderColor = 'border-rose-100';
          } else if (hasReposo || hasVacaciones) {
            bgColor = 'bg-indigo-50';
            borderColor = 'border-indigo-100';
          }

          const isClosed = records.some(r => r.cerrado);
          if (isClosed) {
            borderColor = 'border-slate-400';
          }

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => openDayEditor(dateStr)}
              className={`h-24 md:h-28 border rounded-xl p-2 md:p-3 flex flex-col relative transition-all duration-200 text-left focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 ${
                bgColor
              } ${borderColor} ${isClosed ? 'opacity-80' : 'hover:-translate-y-1 hover:shadow-lg hover:scale-[1.02] active:scale-95 cursor-pointer'} ${
                isSelectedDay ? 'ring-2 ring-emerald-500 ring-offset-2 z-10 shadow-md' : ''
              }`}
            >
              {/* Header Día */}
              <div className="flex justify-between items-start mb-1">
                <span className={`text-xs font-bold ${isHoliday ? 'text-orange-600' : isSunday ? 'text-rose-500' : 'text-slate-700'}`}>
                  {date.getDate()}
                </span>
                <div className="flex gap-1 items-center">
                  {records.length > 1 && (
                    <span className="text-[8px] bg-slate-200 text-slate-600 px-1 rounded font-black">x{records.length}</span>
                  )}
                  {isHoliday && (
                    <span className="text-[8px] font-black text-orange-700 bg-orange-100 px-1 rounded border border-orange-200">FERIADO</span>
                  )}
                  {isClosed && <span className="text-[9px]" title="Pagado">🔒</span>}
                  {hasFalta && !hasPresent && (
                     <span className="text-[8px] font-black text-rose-600 bg-rose-100 px-1 rounded">FALTA</span>
                  )}
                </div>
              </div>
              
              {/* Contenido Asistencia */}
              {hasPresent ? (
                <div className="flex flex-col gap-0.5 mt-auto">
                    {isHoliday && (
                      <div className="mb-1 text-[8px] font-black text-orange-700 uppercase truncate">
                        {holiday?.name}
                      </div>
                    )}

                    <div className="flex justify-between items-center bg-emerald-600 text-white px-1.5 py-0.5 rounded-lg">
                        <span className="text-[9px] font-black uppercase tracking-tighter">Hrs:</span>
                        <span className="text-[10px] font-black">{totalHoursDay.toFixed(1)}</span>
                    </div>

                    {isSunday ? (
                        <div className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 text-center">
                            D. Descanso
                        </div>
                    ) : (
                        <>
                            {hasExtras && (
                                <div className="text-[8px] text-emerald-600 font-bold px-1">+ Extra</div>
                            )}
                        </>
                    )}

                    {dominantShiftBadge && (
                      <div className={`text-center text-[8px] font-black uppercase rounded py-0.5 px-1 flex items-center justify-center gap-0.5 ${(dominantShiftBadge as any).color}`}>
                        <span>{(dominantShiftBadge as any).icon}</span>
                        <span>{(dominantShiftBadge as any).label}</span>
                      </div>
                    )}
                </div>
              ) : (
                 <div className="mt-auto text-center">
                    {isHoliday ? (
                      <div className="space-y-0.5">
                        <div className="text-[8px] font-black text-orange-700 uppercase truncate">{holiday?.name}</div>
                      </div>
                    ) : (
                      <div className="text-[9px] text-slate-300 font-medium uppercase">- Sin Reg -</div>
                    )}
                 </div>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const selectedHistoryRecords = selectedDate ? getHistoryRecordsByDate(selectedDate) : [];
  const selectedHistoryRecord = selectedDate && dayDraft.id ? selectedHistoryRecords.find(h => h.id === dayDraft.id) : null;
  const selectedHoliday = selectedDate ? holidaysByDate[selectedDate] : null;
  const selectedDateLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('es-VE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '';
  const overnightExit = !!(selectedDate && dayDraft.hora_entrada && dayDraft.hora_salida && dayDraft.hora_salida < dayDraft.hora_entrada);
  const selectedShift = selectedDate && dayDraft.estado === 'presente' && dayDraft.hora_entrada && dayDraft.hora_salida
    ? calculateDetailedShift(
        `${selectedDate}T${dayDraft.hora_entrada}:00`,
        overnightExit
          ? `${new Date(new Date(selectedDate).getTime() + 86400000).toISOString().split('T')[0]}T${dayDraft.hora_salida}:00`
          : `${selectedDate}T${dayDraft.hora_salida}:00`,
        selectedDate
      )
    : null;
  const shift = selectedShift;
  const selectedTotalHours = selectedShift
    ? selectedShift.normal + selectedShift.extraDiurna + selectedShift.extraNocturna + selectedShift.descanso
    : 0;
  const badgeColors: Record<string, string> = {
    Diurna: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Mixta: 'bg-amber-100 text-amber-700 border-amber-200',
    Nocturna: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  };
  const quickEntryTimes = ['07:00', '08:00', '08:30', '13:00'];
  const quickExitTimes = ['12:00', '17:00', '18:00', '19:00', '22:00'];

  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      
      {/* Header & Tabs */}
      <div className="border-b border-slate-50 bg-white p-5 sm:p-6 lg:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span>Horario</span> Control de Asistencia
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Gestión de Jornada Laboral (LOTTT)
          </p>
        </div>
        
        <div className="flex w-full flex-col rounded-xl bg-slate-100 p-1 sm:w-auto sm:flex-row">
           <button 
             onClick={() => setActiveTab('daily')}
             className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'daily' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
           >
             Control Diario
           </button>
           <button 
             onClick={() => setActiveTab('calendar')}
             className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'calendar' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
           >
             Histórico & Cierre
           </button>
        </div>
      </div>

      {/* VISTA DIARIA (Control de Asistencia del Día) */}
      {activeTab === 'daily' && (
        <>
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6 lg:px-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
             <div className="text-sm font-bold text-slate-600">
               Fecha de Hoy: <span className="text-emerald-600 capitalize">{new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
             </div>
             <div className="flex w-full gap-4 items-center md:w-auto">
               <select
                 className="min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer md:flex-none"
                 value={selectedBranchId}
                 onChange={e => setSelectedBranchId(e.target.value)}
               >
                 <option value="">Todas las sucursales</option>
                 {branches.map(b => (
                   <option key={b.id} value={b.id}>{b.nombre_id}</option>
                 ))}
               </select>
             </div>
          </div>

          <div className="overflow-x-auto px-2 pb-2 sm:px-4 lg:px-6">
            <table className="w-full text-left">
              <thead className="bg-[#F8F9FB] text-slate-400 text-[10px] font-black uppercase tracking-[0.15em] border-b border-slate-50">
                <tr>
                  <th className="px-8 py-5">Empleado</th>
                  <th className="px-8 py-5">Entrada</th>
                  <th className="px-8 py-5">Salida</th>
                  <th className="px-8 py-5">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={4} className="p-10 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">Sincronizando reloj biométrico...</td></tr>
                ) : employees.filter(emp => selectedBranchId ? emp.sucursal_id === selectedBranchId : true).map(emp => {                  const att = attendances[emp.id];
                  const savedAtt = savedAttendances[emp.id];

                  const entrySaved = !!savedAtt?.id; 
                  const exitSaved = !!savedAtt?.hora_salida;
                  const isClosed = savedAtt?.cerrado;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm">
                            {emp.foto_url ? <img src={emp.foto_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-400 uppercase">{emp.nombre[0]}{emp.apellido[0]}</div>}
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-800 uppercase tracking-tight">{emp.nombre} {emp.apellido}</div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{emp.cargo}</div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-8 py-5">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={att?.hora_entrada || ''}
                              onChange={(e) => handleTimeChange(emp.id, 'hora_entrada', e.target.value)}
                              disabled={entrySaved || isClosed}
                              className={`px-4 py-2 rounded-xl border text-xs font-mono font-bold outline-none transition-all w-32 ${entrySaved || isClosed ? 'bg-slate-50 text-slate-500 border-slate-100' : 'bg-white border-emerald-200 text-emerald-800 focus:ring-2 focus:ring-emerald-500'}`}
                            />
                            {!entrySaved && !isClosed ? (
                               <button
                                 onClick={() => saveEntry(emp.id)}
                                 disabled={processingId === emp.id || !att?.hora_entrada}
                                 className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 disabled:opacity-50 disabled:shadow-none"
                               >
                                 {processingId === emp.id ? '...' : 'Confirmar'}
                               </button>
                            ) : (
                               <span className={`${isClosed ? 'text-slate-400' : 'text-emerald-500'} text-lg`}>
                                 {isClosed ? '🔒' : '✓'}
                               </span>
                            )}
                          </div>
                          {(() => {
                            const b = getAmPmBadge(att?.hora_entrada || savedAtt?.hora_entrada);
                            return b ? (
                              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border w-fit flex items-center gap-1 ${b.color}`}>
                                <span>{b.icon}</span>
                                <span className="font-black">{b.ampm}</span>
                                <span className="font-medium opacity-80">· {b.label}</span>
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </td>

                      <td className="px-8 py-5">
                         <div className="flex flex-col gap-1.5">
                           <div className="flex items-center gap-2">
                             <input
                               type="time"
                               value={att?.hora_salida || ''}
                               onChange={(e) => handleTimeChange(emp.id, 'hora_salida', e.target.value)}
                               disabled={!entrySaved || exitSaved || isClosed}
                               className={`px-4 py-2 rounded-xl border text-xs font-mono font-bold outline-none transition-all w-32 ${exitSaved || isClosed ? 'bg-slate-50 text-slate-500 border-slate-100' : !entrySaved ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-emerald-500'}`}
                             />
                             {entrySaved && !exitSaved && !isClosed && (
                                <button
                                  onClick={() => saveExit(emp.id)}
                                  disabled={processingId === emp.id || !att?.hora_salida}
                                  className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 disabled:opacity-50 disabled:shadow-none"
                                >
                                  {processingId === emp.id ? '...' : 'Confirmar'}
                                </button>
                             )}
                             {(exitSaved || isClosed) && <span className="text-slate-400 text-lg">
                                {isClosed && !exitSaved ? '🔒' : '✓'}
                              </span>}
                           </div>
                           {(() => {
                             const b = getAmPmBadge(att?.hora_salida || savedAtt?.hora_salida);
                             const overnight = att?.hora_salida && att?.hora_entrada && att.hora_salida < att.hora_entrada;
                             const savedOvernight = savedAtt?.hora_salida && savedAtt?.hora_entrada && savedAtt.hora_salida < savedAtt.hora_entrada;
                             return (
                               <div className="flex items-center gap-1.5 flex-wrap">
                                 {b && (
                                   <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border w-fit flex items-center gap-1 ${b.color}`}>
                                     <span>{b.icon}</span>
                                     <span className="font-black">{b.ampm}</span>
                                     <span className="font-medium opacity-80">· {b.label}</span>
                                   </span>
                                 )}
                                 {(overnight || savedOvernight) && (
                                   <span className="px-2 py-0.5 rounded-lg text-[9px] font-black border bg-rose-50 text-rose-600 border-rose-200 flex items-center gap-1">
                                     🌙+1 día siguiente
                                   </span>
                                 )}
                               </div>
                             );
                           })()}
                         </div>
                      </td>

                      <td className="px-8 py-5">
                        {(() => {
                          const badge = getShiftBadge(savedAtt?.hora_entrada, savedAtt?.hora_salida, savedAtt?.fecha);
                          const hrs = (entrySaved || exitSaved) ? calculateHoursWorked(savedAtt?.hora_entrada, savedAtt?.hora_salida, savedAtt?.fecha) : 0;
                          return (
                            <div className="flex flex-col gap-1.5">
                              {isClosed ? (
                                <span className="px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider border border-slate-200">🔒 Cerrado/Pagado</span>
                              ) : exitSaved ? (
                                <span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-wider">✓ Completada</span>
                              ) : entrySaved ? (
                                <span className="px-3 py-1.5 bg-emerald-100 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-wider animate-pulse">● Laborando</span>
                              ) : (
                                <span className="px-3 py-1.5 bg-slate-50 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-wider">Pendiente</span>
                              )}
                              {badge && (entrySaved || exitSaved) && (
                                <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${badge.color} flex items-center gap-1 w-fit`}>
                                  <span>{badge.icon}</span> {badge.label}
                                  {hrs > 0 && <span className="ml-1 font-mono">({hrs.toFixed(1)}h)</span>}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* VISTA CALENDARIO / HISTÓRICO (Reporte LOTTT) */}
      {activeTab === 'calendar' && (
        <div className="animate-in slide-in-from-right-4 duration-300 p-5 sm:p-6 lg:p-8">
           
           {/* Filtros */}
           <div className="flex flex-col lg:flex-row gap-4 mb-8 bg-[#F8F9FB] p-6 rounded-2xl border border-slate-100">
              <div className="w-full lg:w-64">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Sucursal</label>
                 <select 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                    value={selectedBranchId}
                    onChange={(e) => {
                       setSelectedBranchId(e.target.value);
                       // Auto-seleccionar primer empleado de la sucursal si existe
                       const filtered = employees.filter(emp => e.target.value ? emp.sucursal_id === e.target.value : true);
                       if (filtered.length > 0) {
                          setSelectedEmployeeId(filtered[0].id);
                       } else {
                          setSelectedEmployeeId('');
                       }
                    }}
                 >
                    <option value="">Todas las sucursales</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.nombre_id}</option>)}
                 </select>
              </div>
              <div className="flex-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Empleado</label>
                 <select 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                 >
                    {employees.filter(emp => selectedBranchId ? emp.sucursal_id === selectedBranchId : true).map(e => <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>)}
                 </select>
              </div>
              <div className="w-full md:w-48">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Mes</label>
                 <select 
                   className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none cursor-pointer"
                   value={selectedMonth}
                   onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                 >
                   {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                     <option key={i} value={i}>{m}</option>
                   ))}
                 </select>
              </div>
              <div className="w-full md:w-32">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Año</label>
                 <input 
                   type="number" 
                   className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none"
                   value={selectedYear}
                   onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                 />
              </div>
           </div>

           {/* Calendario Grid */}
           {renderCalendar()}

           {/* Editor por Día */}
           <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm sm:p-6">
             {!selectedDate ? (
               <div className="text-center text-sm text-slate-400 font-semibold">
                 Seleccione un día del calendario para editar entrada y salida.
               </div>
             ) : (
               <div className="space-y-5">
                 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                   <div>
                     <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">
                       Edición de Asistencia del Día
                     </h3>
                     <p className="text-xs text-slate-500 font-semibold capitalize">{selectedDateLabel}</p>
                     {selectedHoliday && (
                       <div className="mt-2 inline-flex items-start gap-2 px-3 py-2 rounded-xl bg-orange-50 border border-orange-200">
                         <span className="text-sm">🟠</span>
                         <div>
                           <p className="text-[10px] font-black uppercase tracking-wide text-orange-700">
                             {selectedHoliday.name}
                           </p>
                           <p className="text-[11px] font-semibold text-orange-600">
                             {selectedHoliday.detail}
                           </p>
                         </div>
                       </div>
                     )}
                   </div>
                   {selectedHistoryRecord?.cerrado ? (
                     <span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-wider">
                       Día Cerrado / No Editable
                     </span>
                   ) : (
                     <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                       Editable
                     </span>
                   )}
                 </div>

                 <div className="flex flex-wrap items-center gap-2 mb-4">
                   {selectedHistoryRecords.map((r, idx) => (
                     <button
                       key={r.id}
                       onClick={() => openDayEditor(selectedDate, r.id)}
                       className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                         dayDraft.id === r.id
                           ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                           : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
                       }`}
                     >
                       Turno {idx + 1} ({formatDisplayTime(r.hora_entrada)} - {formatDisplayTime(r.hora_salida)})
                     </button>
                   ))}
                   {!selectedHistoryRecords.some(r => r.cerrado) && (
                     <button
                       onClick={() => setDayDraft({ id: undefined, estado: 'presente', hora_entrada: '', hora_salida: '', observaciones: '' })}
                       className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                         !dayDraft.id
                           ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                           : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                       }`}
                     >
                       + Nuevo Turno
                     </button>
                   )}
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                   <div title="Estado administrativo y asistencia registrada para el dia seleccionado." className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado del dia</p>
                     <p className="mt-2 text-lg font-black text-slate-800 capitalize">{dayDraft.estado}</p>
                     <p className="mt-1 text-xs font-medium text-slate-500">{selectedHistoryRecord?.id ? 'Registro existente' : 'Sin registro guardado'}</p>
                   </div>
                   <div title="Horario actual cargado en el editor para entrada y salida." className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Horario visible</p>
                     <p className="mt-2 text-lg font-black text-emerald-700">{dayDraft.hora_entrada || '--:--'} - {dayDraft.hora_salida || '--:--'}</p>
                     <p className="mt-1 text-xs font-medium text-emerald-600">{overnightExit ? 'La salida cruza al dia siguiente' : 'Turno dentro del mismo dia'}</p>
                   </div>
                   <div title="Cantidad total de horas calculadas con la logica LOTTT usando el horario actual del editor." className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Horas proyectadas</p>
                     <p className="mt-2 text-lg font-black text-indigo-700">{selectedShift ? `${selectedTotalHours.toFixed(2)} h` : 'Pendiente'}</p>
                     <p className="mt-1 text-xs font-medium text-indigo-600">{selectedShift ? `Jornada ${selectedShift.shiftType}` : 'Complete entrada y salida'}</p>
                   </div>
                   <div title="Indica si el registro puede editarse o si ya fue bloqueado por cierre administrativo." className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Control administrativo</p>
                     <p className="mt-2 text-lg font-black text-amber-700">{selectedHistoryRecord?.cerrado ? 'Cerrado' : 'Abierto'}</p>
                     <p className="mt-1 text-xs font-medium text-amber-600">{selectedHistoryRecord?.cerrado ? 'No admite cambios' : 'Se puede editar y guardar'}</p>
                   </div>
                 </div>

                 <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Estado</label>
                     <select
                       value={dayDraft.estado}
                       onChange={(e) =>
                         setDayDraft((prev) => ({
                           ...prev,
                           estado: e.target.value as Asistencia['estado'],
                           hora_entrada: e.target.value === 'presente' ? prev.hora_entrada : '',
                           hora_salida: e.target.value === 'presente' ? prev.hora_salida : ''
                         }))
                       }
                       disabled={!!selectedHistoryRecord?.cerrado}
                       className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                     >
                       <option value="presente">Presente</option>
                       <option value="falta">Falta</option>
                       <option value="reposo">Reposo</option>
                       <option value="vacaciones">Vacaciones</option>
                     </select>
                   </div>

                   <div>
                     <div className="flex items-center justify-between mb-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora Entrada</label>
                       {(() => { const b = getAmPmBadge(dayDraft.hora_entrada); return b ? (
                         <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border flex items-center gap-1 ${b.color}`}>
                           <span>{b.icon}</span><span>{b.ampm}</span><span className="opacity-80">· {b.label}</span>
                         </span>
                       ) : null; })()}
                     </div>
                     <input
                       type="time"
                       value={dayDraft.hora_entrada}
                       onChange={(e) => setDayDraft((prev) => ({ ...prev, hora_entrada: e.target.value }))}
                       disabled={dayDraft.estado !== 'presente' || !!selectedHistoryRecord?.cerrado}
                       className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-mono font-bold text-slate-700 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                     />
                     <div className="mt-2 flex flex-wrap gap-2">
                       {quickEntryTimes.map((time) => (
                         <button
                           key={time}
                           type="button"
                           title={`Usar ${time} como hora de entrada`}
                           onClick={() => applyQuickTime('hora_entrada', time)}
                           disabled={dayDraft.estado !== 'presente' || !!selectedHistoryRecord?.cerrado}
                           className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors border ${
                             dayDraft.hora_entrada === time
                               ? 'bg-emerald-600 text-white border-emerald-600'
                               : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                           } disabled:bg-slate-100 disabled:text-slate-300 disabled:border-slate-200`}
                         >
                           {time}
                         </button>
                       ))}
                     </div>
                   </div>

                   <div>
                     <div className="flex items-center justify-between mb-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora Salida</label>
                       <div className="flex items-center gap-1.5 flex-wrap justify-end">
                         {(() => { const b = getAmPmBadge(dayDraft.hora_salida); return b ? (
                           <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border flex items-center gap-1 ${b.color}`}>
                             <span>{b.icon}</span><span>{b.ampm}</span><span className="opacity-80">· {b.label}</span>
                           </span>
                         ) : null; })()}
                         {overnightExit && (
                           <span className="px-2 py-0.5 rounded-lg text-[9px] font-black border bg-rose-50 text-rose-600 border-rose-200">
                             🌙 +1 día sig.
                           </span>
                         )}
                       </div>
                     </div>
                     <input
                       type="time"
                       value={dayDraft.hora_salida}
                       onChange={(e) => setDayDraft((prev) => ({ ...prev, hora_salida: e.target.value }))}
                       disabled={dayDraft.estado !== 'presente' || !!selectedHistoryRecord?.cerrado}
                       className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-mono font-bold text-slate-700 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                     />
                     <div className="mt-2 flex flex-wrap gap-2">
                       {quickExitTimes.map((time) => (
                         <button
                           key={time}
                           type="button"
                           title={`Usar ${time} como hora de salida`}
                           onClick={() => applyQuickTime('hora_salida', time)}
                           disabled={dayDraft.estado !== 'presente' || !!selectedHistoryRecord?.cerrado}
                           className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors border ${
                             dayDraft.hora_salida === time
                               ? 'bg-indigo-600 text-white border-indigo-600'
                               : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                           } disabled:bg-slate-100 disabled:text-slate-300 disabled:border-slate-200`}
                         >
                           {time}
                         </button>
                       ))}
                     </div>
                   </div>

                   <div className="md:col-span-1 flex items-end gap-2">
                     <button
                       type="button"
                       onClick={saveCalendarDay}
                       disabled={savingCalendarDay || !!selectedHistoryRecord?.cerrado}
                       className="flex-1 py-3 rounded-xl bg-[#1E1E2D] text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                     >
                       {savingCalendarDay ? 'Guardando...' : 'Guardar Día'}
                     </button>
                     
                     {selectedHistoryRecord?.id && !selectedHistoryRecord.cerrado && (
                       <button
                         type="button"
                         onClick={deleteDay}
                         disabled={savingCalendarDay}
                         className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                         title="Eliminar este registro"
                       >
                         🗑️
                       </button>
                     )}
                   </div>
                 </div>

                 {/* Detalles de la Jornada (Solo si está presente) */}
                 {selectedShift && (
                   <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                     <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Análisis LOTTT</span>
                        <div className="flex flex-col gap-3 w-full mt-2">
                              {/* Fila superior: Tipo de Jornada y Total */}
                              <div className="flex items-center justify-between gap-4">
                                <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border ${badgeColors[shift.shiftType] || 'bg-slate-100'}`}>
                                  Jornada {shift.shiftType}
                                </span>
                                <span className="text-lg font-black text-slate-800">
                                  {selectedTotalHours.toFixed(1)}h <span className="text-[10px] text-slate-400 font-bold uppercase">Totales</span>
                                </span>
                              </div>

                              {/* Grid de Desglose */}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <div title="Horas dentro del limite normal de la jornada segun la LOTTT." className="bg-white p-3 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Horas Normales</p>
                                  <p className="text-sm font-black text-emerald-600">{shift.normal.toFixed(1)}h</p>
                                </div>
                                <div title="Suma de horas extra diurnas y nocturnas calculadas para este dia." className="bg-white p-3 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Horas Extras</p>
                                  <p className="text-sm font-black text-rose-500">{(shift.extraDiurna + shift.extraNocturna).toFixed(1)}h</p>
                                </div>
                                <div title="Horas trabajadas en descanso o fin de semana para este registro." className="bg-white p-3 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Descanso laborado</p>
                                  <p className="text-sm font-black text-amber-600">{shift.descanso.toFixed(1)}h</p>
                                </div>
                                <div title="Horas con recargo nocturno a considerar para bono nocturno o jornada mixta." className="bg-white p-3 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Horas nocturnas</p>
                                  <p className="text-sm font-black text-indigo-600">{shift.nightHours.toFixed(1)}h</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div title="Hora registrada de entrada en formato de 24 horas." className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Entrada</p>
                                  <p className="text-sm font-black text-slate-800">{formatDisplayTime(`${selectedDate}T${dayDraft.hora_entrada}:00`)}</p>
                                </div>
                                <div title="Hora registrada de salida. Si es menor que la entrada, se interpreta como salida del dia siguiente." className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Salida</p>
                                  <p className="text-sm font-black text-slate-800">{dayDraft.hora_salida}</p>
                                </div>
                                <div title="Indica si el turno termina al dia siguiente porque la salida es menor que la entrada." className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Cruce de medianoche</p>
                                  <p className="text-sm font-black text-slate-800">{overnightExit ? 'Si' : 'No'}</p>
                                </div>
                              </div>
                            </div>
                     </div>
                   </div>
                 )}

                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Observaciones</label>
                   <textarea
                     value={dayDraft.observaciones}
                     onChange={(e) => setDayDraft((prev) => ({ ...prev, observaciones: e.target.value }))}
                     disabled={!!selectedHistoryRecord?.cerrado}
                     placeholder="Notas del día (opcional)"
                     className="w-full min-h-20 px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none disabled:bg-slate-100 disabled:text-slate-400 resize-y"
                   />
                 </div>
               </div>
             )}
           </div>

           {/* Resumen Quincenal LOTTT */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              {[false, true].map((isSecondHalf) => {
                 const stats = getStatsQuincena(isSecondHalf);
                 const title = isSecondHalf ? 'Segunda Quincena (16 - Fin)' : 'Primera Quincena (01 - 15)';
                 
                 return (
                    <div key={title} className={`border rounded-2xl p-6 shadow-sm transition-all ${stats.isClosed ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-white border-slate-200'}`}>
                       <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                         <span>🗓️</span> {title}
                         {stats.isClosed && <span className="ml-auto text-[10px] bg-slate-200 text-slate-500 px-2 py-1 rounded">CERRADO</span>}
                       </h3>
                       <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                             <span className="text-xs font-medium text-slate-500">Días Trabajados</span>
                             <span className="text-sm font-black text-slate-800">{stats.daysWorked} días</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl">
                             <span className="text-xs font-medium text-emerald-700">Horas Totales</span>
                             <span className="text-sm font-black text-emerald-800">{stats.totalHours.toFixed(1)} hrs</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-rose-50 rounded-xl">
                             <span className="text-xs font-medium text-rose-700">Faltas / Inasistencias</span>
                             <span className="text-sm font-black text-rose-800">{stats.inasistencias}</span>
                          </div>
                       </div>
                       <button 
                         onClick={() => handleCloseQuincena(isSecondHalf)}
                         disabled={stats.isClosed}
                         className={`w-full mt-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                            stats.isClosed 
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                            : 'bg-[#1E1E2D] text-white hover:bg-black'
                         }`}
                       >
                          {stats.isClosed ? 'Quincena Cerrada' : 'Cerrar Quincena'}
                       </button>
                    </div>
                 );
              })}
           </div>
        </div>
      )}

      <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 font-bold uppercase text-center tracking-widest">
        Sistema sincronizado con horario legal LOTTT Venezuela • Jornada Diurna/Mixta
      </div>
    </div>
  );
};

export default AttendanceManager;
