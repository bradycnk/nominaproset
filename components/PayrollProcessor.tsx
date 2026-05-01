import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useSupabaseRealtime } from '../lib/useSupabaseRealtime.ts';
import { Empleado, ConfigGlobal, Asistencia, Adelanto, ReceiptPrintConfig, Nomina } from '../types.ts';
import { calculateDetailedShift, calculatePayroll, fetchBcvRate, processAttendanceRecords } from '../services/payrollService.ts';
import { getVenezuelanHolidays, formatHolidayDateKey, formatLocalDateKey } from '../lib/venezuelanHolidays.ts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';


const getBase64ImageFromUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const LOGO_URL = "https://cfncthqiqabezmemosrz.supabase.co/storage/v1/object/public/expedientes/logos/logo_1770579845203.jpeg";

// Esquema fijo de la quincena: 11 días laborados + 4 días de descanso = 15 días.
// Es el valor por defecto a nivel global; el admin lo puede editar desde
// "Configurar Recibo Global" o por empleado, y se persiste en la columna
// `receipt_print_config` (configuracion_global o empleados). NO se recalcula
// desde asistencia: lo que digite el admin es lo que sale en el recibo.
const defaultReceiptConfig: ReceiptPrintConfig = {
  diasLaborados: { enabled: true, cantidad: 11, montoUnitario: 4.33 }, // 130 / 30
  diasDescanso: { enabled: true, cantidad: 4, montoUnitario: 4.33 },
  descansoLaborado: { enabled: false, cantidad: 0, montoUnitario: 6.50 }, // 4.33 * 1.5
  domingoLaborado: { enabled: false, cantidad: 0, montoUnitario: 6.50 }, // 4.33 * 1.5
  horasExtrasDiurnas: { enabled: true, cantidad: 0, montoUnitario: 0.81 }, // (4.33 / 8) * 1.5
  feriadosLaborados: { enabled: false, cantidad: 0, montoUnitario: 6.50 }, // 4.33 * 1.5
  bonoNocturno: { enabled: true, cantidad: 0, montoUnitario: 0.16 }, // (4.33 / 8) * 0.30
  turnosLaborados: { enabled: false, cantidad: 0, montoUnitario: 4.33 },
  bonoJornadaMixta: { enabled: false, cantidad: 0, montoUnitario: 0.16 }, // (4.33 / 8) * 0.30
  horasExtrasNocturnas: { enabled: true, cantidad: 0, montoUnitario: 1.06 }, // (4.33 / 8) * 1.95
  diasCompensatorios: { enabled: false, cantidad: 0, montoUnitario: 4.33 },
  sabadoLaborado: { enabled: false, cantidad: 0, montoUnitario: 4.33 },
  bonoAlimentacion: { enabled: true, cantidad: 1, montoUnitario: 0 },
  otrasAsignaciones: { enabled: false, cantidad: 1, montoUnitario: 0 },
  vales: { enabled: true, cantidad: 1, montoUnitario: 0 },
  sso: { enabled: true, cantidad: 1, montoUnitario: 0 },
  rpe: { enabled: true, cantidad: 1, montoUnitario: 0 },
  faov: { enabled: true, cantidad: 1, montoUnitario: 0 },
  islr: { enabled: false, cantidad: 1, montoUnitario: 0 },
  adelantoNomina: { enabled: true, cantidad: 1, montoUnitario: 0 },
  prestamo: { enabled: true, cantidad: 1, montoUnitario: 0 },
};

const PRORRATEO_DRAFT_KEY = 'payroll-prorrateo-draft';

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
};

const normalizeReceiptItem = (raw: any, fallback: any) => {
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    cantidad: typeof raw.cantidad === 'number' ? raw.cantidad : fallback.cantidad,
    montoUnitario: typeof raw.montoUnitario === 'number' ? raw.montoUnitario : fallback.montoUnitario,
  };
};

const normalizeReceiptPrintConfig = (rawConfig: unknown): ReceiptPrintConfig => {
  const source = rawConfig && typeof rawConfig === 'object' ? (rawConfig as Partial<ReceiptPrintConfig>) : {};

  return {
    diasLaborados: normalizeReceiptItem(source.diasLaborados, defaultReceiptConfig.diasLaborados),
    diasDescanso: normalizeReceiptItem(source.diasDescanso, defaultReceiptConfig.diasDescanso),
    descansoLaborado: normalizeReceiptItem(source.descansoLaborado, defaultReceiptConfig.descansoLaborado),
    domingoLaborado: normalizeReceiptItem(source.domingoLaborado, defaultReceiptConfig.domingoLaborado),
    horasExtrasDiurnas: normalizeReceiptItem(source.horasExtrasDiurnas, defaultReceiptConfig.horasExtrasDiurnas),
    feriadosLaborados: normalizeReceiptItem(source.feriadosLaborados, defaultReceiptConfig.feriadosLaborados),
    bonoNocturno: normalizeReceiptItem(source.bonoNocturno, defaultReceiptConfig.bonoNocturno),
    turnosLaborados: normalizeReceiptItem(source.turnosLaborados, defaultReceiptConfig.turnosLaborados),
    bonoJornadaMixta: normalizeReceiptItem(source.bonoJornadaMixta, defaultReceiptConfig.bonoJornadaMixta),
    horasExtrasNocturnas: normalizeReceiptItem(source.horasExtrasNocturnas, defaultReceiptConfig.horasExtrasNocturnas),
    diasCompensatorios: normalizeReceiptItem(source.diasCompensatorios, defaultReceiptConfig.diasCompensatorios),
    sabadoLaborado: normalizeReceiptItem(source.sabadoLaborado, defaultReceiptConfig.sabadoLaborado),
    bonoAlimentacion: normalizeReceiptItem(source.bonoAlimentacion, defaultReceiptConfig.bonoAlimentacion),
    otrasAsignaciones: normalizeReceiptItem(source.otrasAsignaciones, defaultReceiptConfig.otrasAsignaciones),
    vales: normalizeReceiptItem(source.vales, defaultReceiptConfig.vales),
    sso: normalizeReceiptItem(source.sso, defaultReceiptConfig.sso),
    rpe: normalizeReceiptItem(source.rpe, defaultReceiptConfig.rpe),
    faov: normalizeReceiptItem(source.faov, defaultReceiptConfig.faov),
    islr: normalizeReceiptItem(source.islr, defaultReceiptConfig.islr),
    adelantoNomina: normalizeReceiptItem(source.adelantoNomina, defaultReceiptConfig.adelantoNomina),
    prestamo: normalizeReceiptItem(source.prestamo, defaultReceiptConfig.prestamo),
  };
};

const PayrollProcessor: React.FC<{ 
  config: ConfigGlobal | null;
  onConfigUpdated?: () => void;
}> = ({ config, onConfigUpdated }) => {
  const [employees, setEmployees] = useState<Empleado[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [principalBranch, setPrincipalBranch] = useState<any>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [attendances, setAttendances] = useState<Asistencia[]>([]);
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);
  const [nominasCerradas, setNominasCerradas] = useState<Nomina[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  
  // Estados para el Modal de Adelantos
  const [showAdelantoModal, setShowAdelantoModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [loanDetailEmployeeId, setLoanDetailEmployeeId] = useState<string | null>(null);
  const [selectedDetailEmployeeId, setSelectedDetailEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [editingAdelantoId, setEditingAdelantoId] = useState<string | null>(null);
  const [adelantoMonto, setAdelantoMonto] = useState('');
  const [adelantoTipo, setAdelantoTipo] = useState<Adelanto['tipo']>('adelanto_nomina');
  const [adelantoCuota, setAdelantoCuota] = useState('');
  const [adelantoMotivo, setAdelantoMotivo] = useState('');
  const [receiptConfig, setReceiptConfig] = useState<ReceiptPrintConfig>(defaultReceiptConfig);
  const [receiptConfigEmployeeId, setReceiptConfigEmployeeId] = useState<string | null>(null);
  const [savingReceiptConfig, setSavingReceiptConfig] = useState(false);

  // Estados para Recibo 2 (Prorrateo)
  const [activeTab, setActiveTab] = useState<'lottt' | 'prorrateo'>('lottt');
  const [montoIndicador, setMontoIndicador] = useState<Record<string, number>>({});
  const [porcentajeRepartir, setPorcentajeRepartir] = useState<Record<string, number>>({});
  const [globalBonoBs, setGlobalBonoBs] = useState<number | ''>(0);
  const [globalBonoUsd, setGlobalBonoUsd] = useState<number | ''>(0);
  const [globalBonoPerc, setGlobalBonoPerc] = useState<number | ''>(100);
  const [extraAssigns, setExtraAssigns] = useState<Record<string, number>>({});
  const [extraDeductions, setExtraDeductions] = useState<Record<string, number>>({});
  const [extraAssignsData, setExtraAssignsData] = useState<Record<string, { nombre: string; montoUsd: number }>>({});
  const [selectedExtraAssignEmpId, setSelectedExtraAssignEmpId] = useState<string | null>(null);
  const [showExtraAssignModal, setShowExtraAssignModal] = useState(false);
  const [selectedExtraDeductEmpId, setSelectedExtraDeductEmpId] = useState<string | null>(null);
  const [showExtraDeductModal, setShowExtraDeductModal] = useState(false);

  // Estado del modal "Listado Cestaticket para Firmas"
  const [showCestaListModal, setShowCestaListModal] = useState(false);
  // USD por empleado para el listado (editable; default = cestaticket_usd × diasEfectivos/30).
  // Estado transitorio: solo vive durante la sesión de impresión, no se persiste.
  const [cestaListUsd, setCestaListUsd] = useState<Record<string, string>>({});
  // Fecha que aparecerá en el encabezado del listado (ej. "Fecha: 28-02-2026").
  const [cestaListFecha, setCestaListFecha] = useState<string>('');
  const [excludedEmployees, setExcludedEmployees] = useState<Record<string, boolean>>({});
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [sortField, setSortField] = useState<'nombre' | 'cedula' | 'asignaciones' | 'deducciones' | 'neto'>('nombre');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [periodo, setPeriodo] = useState<'Q1' | 'Q2'>('Q1');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const currentPayrollPeriodKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${periodo}`;

  useEffect(() => {
    loadData();
  }, [periodo, selectedMonth, selectedYear]);

  // Auto-refresh source data when it changes in the DB. Prorrateo drafts live in
  // localStorage and separate state, so reloading the base data does not clobber
  // in-progress edits.
  useSupabaseRealtime(
    'realtime-payroll',
    ['empleados', 'sucursales', 'asistencias', 'adelantos', 'nominas_mensuales'],
    () => loadData()
  );

  useEffect(() => {
    if (!config) {
      setReceiptConfig(defaultReceiptConfig);
      return;
    }
    setReceiptConfig(normalizeReceiptPrintConfig(config.receipt_print_config));
  }, [config]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const draftRaw = window.localStorage.getItem(PRORRATEO_DRAFT_KEY);
      if (draftRaw) {
        try {
          const draft = JSON.parse(draftRaw);
          if (draft.montoIndicador) setMontoIndicador(draft.montoIndicador);
          if (draft.porcentajeRepartir) setPorcentajeRepartir(draft.porcentajeRepartir);
          if (draft.extraAssigns) setExtraAssigns(draft.extraAssigns);
          if (draft.extraAssignsData) setExtraAssignsData(draft.extraAssignsData);
          if (draft.extraDeductions) setExtraDeductions(draft.extraDeductions);
          if (draft.excludedEmployees) setExcludedEmployees(draft.excludedEmployees);
          if (draft.globalBonoBs !== undefined) setGlobalBonoBs(draft.globalBonoBs);
          if (draft.globalBonoUsd !== undefined) setGlobalBonoUsd(draft.globalBonoUsd);
          if (draft.globalBonoPerc !== undefined) setGlobalBonoPerc(draft.globalBonoPerc);
          return;
        } catch (error) {
          console.warn('No se pudo restaurar el borrador de prorrateo:', error);
        }
      }
    }

    if (config?.prorrateo_config) {
      const pc = config.prorrateo_config;
      if (pc.montoIndicador) setMontoIndicador(pc.montoIndicador);
      if (pc.porcentajeRepartir) setPorcentajeRepartir(pc.porcentajeRepartir);
      if (pc.extraAssigns) setExtraAssigns(pc.extraAssigns);
      if (pc.extraAssignsData) setExtraAssignsData(pc.extraAssignsData);
      if (pc.extraDeductions) setExtraDeductions(pc.extraDeductions);
      if (pc.excludedEmployees) setExcludedEmployees(pc.excludedEmployees);
      if (pc.globalBonoBs !== undefined) setGlobalBonoBs(pc.globalBonoBs);
      if (pc.globalBonoUsd !== undefined) setGlobalBonoUsd(pc.globalBonoUsd);
      if (pc.globalBonoPerc !== undefined) setGlobalBonoPerc(pc.globalBonoPerc);
    }
  }, [config]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
      PRORRATEO_DRAFT_KEY,
      JSON.stringify({
        montoIndicador,
        porcentajeRepartir,
        extraAssigns,
        extraAssignsData,
        extraDeductions,
        excludedEmployees,
        globalBonoBs,
        globalBonoUsd,
        globalBonoPerc,
      })
    );
  }, [
    montoIndicador,
    porcentajeRepartir,
    extraAssigns,
    extraAssignsData,
    extraDeductions,
    excludedEmployees,
    globalBonoBs,
    globalBonoUsd,
    globalBonoPerc,
  ]);


  const loadData = async () => {
    setLoadingData(true);
    const startDay = periodo === 'Q1' ? 1 : 16;
    const endDay = periodo === 'Q1' ? 15 : new Date(selectedYear, selectedMonth + 1, 0).getDate();
    // Usamos componentes locales para evitar el bug de toISOString() que retrocede
    // un día en timezones positivas (Madrid, etc.) al convertir medianoche local a UTC.
    const startDate = formatLocalDateKey(new Date(selectedYear, selectedMonth, startDay));
    const endDate = formatLocalDateKey(new Date(selectedYear, selectedMonth, endDay));

    const { data: brData } = await supabase.from('sucursales').select('*').order('nombre_id');
    const { data: empData } = await supabase.from('empleados').select('*, sucursales(*)').eq('activo', true);

    const principal = brData?.find((b: any) => b.es_principal) || null;
    setPrincipalBranch(principal);
    const { data: attData } = await supabase.from('asistencias').select('*').gte('fecha', startDate).lte('fecha', endDate);
    const { data: nomData } = await supabase.from('nominas_mensuales')
        .select('*')
        .eq('mes', selectedMonth + 1)
        .eq('anio', selectedYear)
        .eq('quincena', periodo);
    
    // Cargar adelantos pendientes o aprobados en este rango de fecha (o sin fecha de pago aún)
    const { data: adData } = await supabase
        .from('adelantos')
        .select('*')
        .in('estado', ['aprobado', 'pagado']); 

    setBranches(brData || []);
    // Excluir empleados en estatus 'Vacaciones': no entran en la nómina activa
    // del período (recibos, listado cestaticket, recibo general, etc.).
    setEmployees((empData || []).filter((e: any) => e.estado_laboral !== 'Vacaciones'));
    setAttendances(attData || []);
    setAdelantos(adData || []);
    setNominasCerradas(nomData || []);
    setLoadingData(false);
  };

  const handleCreateAdelanto = async () => {
    if (!selectedEmployeeId || !adelantoMonto) return;

    const monto = toNumber(adelantoMonto, 0);
    const cuotaIngresada = toNumber(adelantoCuota, 0);
    const cuotaQuincenal = adelantoTipo === 'prestamo_credito'
      ? Math.min(monto, Math.max(0, cuotaIngresada))
      : monto;

    if (monto <= 0) {
      alert('Ingrese un monto válido.');
      return;
    }

    if (adelantoTipo === 'prestamo_credito' && cuotaQuincenal <= 0) {
      alert('Para préstamo/crédito debe indicar una cuota quincenal mayor a 0.');
      return;
    }

    try {
        if (editingAdelantoId) {
          const { error } = await supabase
            .from('adelantos')
            .update({
              tipo: adelantoTipo,
              monto,
              cuota_quincenal: cuotaQuincenal,
              saldo_pendiente: monto,
              motivo: adelantoMotivo,
            })
            .eq('id', editingAdelantoId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('adelantos').insert({
              empleado_id: selectedEmployeeId,
              tipo: adelantoTipo,
              monto,
              cuota_quincenal: cuotaQuincenal,
              saldo_pendiente: monto,
              motivo: adelantoMotivo || (adelantoTipo === 'prestamo_credito' ? 'Préstamo / Crédito' : 'Adelanto de Nómina'),
              estado: 'aprobado',
              fecha_solicitud: new Date().toISOString()
          });
          if (error) throw error;
        }
        
        setShowAdelantoModal(false);
        setEditingAdelantoId(null);
        setAdelantoMonto('');
        setAdelantoCuota('');
        setAdelantoTipo('adelanto_nomina');
        setAdelantoMotivo('');
        loadData();
        alert(editingAdelantoId ? 'Registro actualizado' : 'Registro guardado correctamente');
    } catch (err) {
        console.error(err);
        alert('Error al procesar la solicitud');
    }
  };

  const handleDeleteAdelanto = async (id: string) => {
    if (!window.confirm('¿Está seguro de eliminar este registro permanentemente?')) return;
    try {
      const { error } = await supabase.from('adelantos').delete().eq('id', id);
      if (error) throw error;
      loadData();
      alert('Registro eliminado');
    } catch (err) {
      console.error(err);
      alert('Error al eliminar');
    }
  };

  const getAdelantoStatus = (item: Adelanto) => {
    const tipo = item.tipo || 'adelanto_nomina';
    const saldoPendiente = Math.max(0, toNumber(item.saldo_pendiente ?? item.monto, 0));
    const cuotaQuincenal = Math.max(0, toNumber(item.cuota_quincenal ?? item.monto, 0));
    return { tipo, saldoPendiente, cuotaQuincenal };
  };

  const getAdelantosForPeriod = (empleadoId: string, maxAllowed: number) => {
    const aplicados: Array<{ id: string; tipo: 'adelanto_nomina' | 'prestamo_credito'; deducted: number; newSaldo: number }> = [];
    let remaining = Math.max(0, maxAllowed);

    const pendientes = adelantos
      .filter((a) => a.empleado_id === empleadoId && a.estado === 'aprobado')
      .sort((a, b) => new Date(a.fecha_solicitud || 0).getTime() - new Date(b.fecha_solicitud || 0).getTime());

    for (const item of pendientes) {
      if (remaining <= 0) break;
      const { tipo, saldoPendiente, cuotaQuincenal } = getAdelantoStatus(item);
      if (saldoPendiente <= 0) continue;
      if (item.ultimo_periodo_descuento === currentPayrollPeriodKey) continue;

      const solicitado = tipo === 'prestamo_credito' ? cuotaQuincenal : saldoPendiente;
      const descontar = Math.min(solicitado, saldoPendiente, remaining);
      if (descontar <= 0) continue;

      remaining -= descontar;
      const newSaldo = Math.max(0, Number((saldoPendiente - descontar).toFixed(2)));
      aplicados.push({ id: item.id, tipo, deducted: descontar, newSaldo });
    }

    const total = aplicados.reduce((sum, item) => sum + item.deducted, 0);
    return { total, aplicados };
  };

  const getPrestamoSaldoByEmployee = (empleadoId: string) => {
    const prestamosActivos = adelantos.filter((item) => {
      if (item.empleado_id !== empleadoId) return false;
      if (item.estado !== 'aprobado') return false;
      return (item.tipo || 'adelanto_nomina') === 'prestamo_credito';
    });

    const totalSaldoPendiente = prestamosActivos.reduce((sum, item) => {
      const saldo = Math.max(0, toNumber(item.saldo_pendiente ?? item.monto, 0));
      return sum + saldo;
    }, 0);

    return {
      totalSaldoPendiente,
      cantidad: prestamosActivos.length,
    };
  };

  const getPrestamosDetalleByEmployee = (empleadoId: string) =>
    adelantos
      .filter((item) => item.empleado_id === empleadoId)
      .sort((a, b) => new Date(b.created_at || b.fecha_solicitud || 0).getTime() - new Date(a.created_at || a.fecha_solicitud || 0).getTime());

  const persistAdelantosApplied = async (aplicados: Array<{ id: string; tipo: 'adelanto_nomina' | 'prestamo_credito'; deducted: number; newSaldo: number }>) => {
    if (aplicados.length === 0) return;

    const deduccionPorId = new Map<string, { deducted: number; newSaldo: number }>();
    for (const item of aplicados) {
      deduccionPorId.set(item.id, item);
    }

    const upsertData = Array.from(deduccionPorId.entries()).map(([id, item]) => ({
      id,
      saldo_pendiente: item.newSaldo,
      estado: item.newSaldo <= 0 ? 'pagado' : 'aprobado',
      ultimo_periodo_descuento: currentPayrollPeriodKey
    }));

    if (upsertData.length > 0) {
      const { error } = await supabase
        .from('adelantos')
        .upsert(upsertData);

      if (error) throw error;
    }
  };

  const handleSaveReceiptConfig = async () => {
    setSavingReceiptConfig(true);
    try {
      if (receiptConfigEmployeeId) {
        const { error } = await supabase
          .from('empleados')
          .update({ receipt_print_config: receiptConfig })
          .eq('id', receiptConfigEmployeeId);

        if (error) throw error;
        setEmployees(prev => prev.map(emp => emp.id === receiptConfigEmployeeId ? { ...emp, receipt_print_config: receiptConfig } : emp));
      } else {
        if (!config?.id) {
          setShowConfigModal(false);
          return;
        }
        const { error } = await supabase
          .from('configuracion_global')
          .update({
            receipt_print_config: receiptConfig,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
        // Refresco instantáneo para evitar recargar la página
        if (onConfigUpdated) onConfigUpdated();
      }
      
      setShowConfigModal(false);
      alert('Configuración del recibo guardada.');
    } catch (error) {
      console.error(error);
      alert('No se pudo guardar la configuración del recibo.');
    } finally {
      setSavingReceiptConfig(false);
    }
  };

  const [resettingAllReceipts, setResettingAllReceipts] = useState(false);

  const buildFullReceiptConfigFromAttendance = (emp: Empleado): ReceiptPrintConfig | null => {
    if (!config) return null;
    // Para esta función "full" usamos el config global como base; el empleado podría
    // tener override propio pero "Restablecer todos" se ejecuta a nivel global y la
    // intención es uniformar al esquema configurado. Si el empleado tenía override
    // específico se reemplaza al guardar (es el flujo deseado).
    const baseConfig = emp.receipt_print_config && Object.keys(emp.receipt_print_config).length > 0
      ? normalizeReceiptPrintConfig(emp.receipt_print_config)
      : (config?.receipt_print_config ? normalizeReceiptPrintConfig(config.receipt_print_config) : defaultReceiptConfig);

    const empAsistencias = attendances.filter((a) => a.empleado_id === emp.id);
    const hoursData = processAttendanceRecords(empAsistencias);
    const calcBase = calculatePayroll(emp, config, 15, periodo);
    const salarioDiario = calcBase.salario_diario_normal;
    const salarioHora = salarioDiario / 8;

    const presentRecords = empAsistencias.filter(
      (att) => att.estado === 'presente' && att.hora_entrada && att.hora_salida
    );

    // Cache de feriados por año tocado por las asistencias del período (Q1/Q2 nunca cruza año).
    const holidaysByYear: Record<number, Record<string, { name: string; detail: string }>> = {};
    const isHolidayDate = (fecha: string) => {
      const year = Number(fecha.slice(0, 4));
      if (!Number.isFinite(year)) return false;
      if (!holidaysByYear[year]) holidaysByYear[year] = getVenezuelanHolidays(year);
      return Boolean(holidaysByYear[year][fecha]);
    };

    const feriadosLaboradosCount = presentRecords.filter((att) => isHolidayDate(att.fecha)).length;
    // Domingos y sábados que NO sean feriado, para evitar doble pago con feriadosLaborados.
    const domingoLaborado = presentRecords.filter(
      (att) => new Date(`${att.fecha}T00:00:00`).getDay() === 0 && !isHolidayDate(att.fecha)
    ).length;
    const sabadoLaborado = presentRecords.filter(
      (att) => new Date(`${att.fecha}T00:00:00`).getDay() === 6 && !isHolidayDate(att.fecha)
    ).length;

    const bonoJornadaMixta = presentRecords.reduce((sum, att) => {
      const shift = calculateDetailedShift(att.hora_entrada || '', att.hora_salida || '', att.fecha);
      return shift.shiftType === 'Mixta' ? sum + shift.nightHours : sum;
    }, 0);

    // 11 + 4 fijo (editable por config). Ver buildAttendanceDrivenReceiptConfig.
    const diasLaboradosFijos = baseConfig.diasLaborados?.cantidad ?? 11;
    const diasDescansoCount = baseConfig.diasDescanso?.cantidad ?? 4;
    // descansoLaborado se mantiene atado al esquema fijo: si laborados > 11, los
    // sábados laborados pagan recargo. Con 11 fijo nunca dispara, lo cual es el
    // comportamiento correcto para turneros (queda bajo control manual del admin).
    const descansoLabCount = diasLaboradosFijos > 11 ? sabadoLaborado : 0;

    // Verificar adelantos/préstamos activos
    const empAdelantos = adelantos.filter(a => a.empleado_id === emp.id && a.estado === 'aprobado');
    const tieneAdelanto = empAdelantos.some(a => a.tipo === 'adelanto_nomina');
    const tienePrestamo = empAdelantos.some(a => a.tipo === 'prestamo_credito');

    // Calcular asignaciones para determinar deducciones
    // hoursData.totalNightHours ya incluye las horas de turnos Mixta.
    // Para evitar doble conteo con bonoJornadaMixta, el bono nocturno "puro" excluye las horas Mixtas.
    const bonoNocturnoHoras = Math.max(0, hoursData.totalNightHours - bonoJornadaMixta);

    // Días laborados FIJOS (independiente de asistencia): garantiza uniformidad
    // entre trabajadores. La inasistencia se refleja vía cestaticket / deducciones.
    const diasLaboradosEff = diasLaboradosFijos;
    const aDiasLab = diasLaboradosEff * salarioDiario;
    const aDescanso = diasDescansoCount * salarioDiario;
    const aDescansoLab = descansoLabCount * salarioDiario * 1.5;
    const aDomLab = domingoLaborado * salarioDiario * 1.5;
    const aFerLab = feriadosLaboradosCount * salarioDiario * 1.5;
    const aExtDiur = hoursData.totalExtraDiurna * salarioHora * 1.5;
    const aBonoNoc = bonoNocturnoHoras * salarioHora * 0.3;
    const aBonoMix = bonoJornadaMixta * salarioHora * 0.3;
    const aExtNoc = hoursData.totalExtraNocturna * salarioHora * 1.95;
    const aCesta = calcBase.bono_alimentacion_vef;

    const totalAsignaciones = aDiasLab + aDescanso + aDescansoLab + aDomLab + aFerLab + aExtDiur + aBonoNoc + aBonoMix + aExtNoc + aCesta;

    // Recalcular deducciones con base imponible real (sin cestaticket)
    const calc = calculatePayroll(emp, config, 15, periodo, totalAsignaciones - aCesta);

    // Calcular adelantos
    const maxAdelantosPermitido = Math.max(0, totalAsignaciones - (calc.deduccion_ivss + calc.deduccion_spf + calc.deduccion_faov));
    const adelantosCalculados = getAdelantosForPeriod(emp.id, maxAdelantosPermitido);
    const autoAdelantoNomina = adelantosCalculados.aplicados
      .filter((item) => item.tipo === 'adelanto_nomina')
      .reduce((sum, item) => sum + item.deducted, 0);
    const autoPrestamoCredito = adelantosCalculados.aplicados
      .filter((item) => item.tipo === 'prestamo_credito')
      .reduce((sum, item) => sum + item.deducted, 0);

    return {
      diasLaborados: { enabled: true, cantidad: diasLaboradosEff, montoUnitario: salarioDiario },
      diasDescanso: { enabled: true, cantidad: diasDescansoCount, montoUnitario: salarioDiario },
      descansoLaborado: { enabled: descansoLabCount > 0, cantidad: descansoLabCount, montoUnitario: salarioDiario * 1.5 },
      domingoLaborado: { enabled: domingoLaborado > 0, cantidad: domingoLaborado, montoUnitario: salarioDiario * 1.5 },
      horasExtrasDiurnas: { enabled: hoursData.totalExtraDiurna > 0, cantidad: hoursData.totalExtraDiurna, montoUnitario: salarioHora * 1.5 },
      feriadosLaborados: { ...baseConfig.feriadosLaborados, enabled: feriadosLaboradosCount > 0, cantidad: feriadosLaboradosCount, montoUnitario: salarioDiario * 1.5 },
      bonoNocturno: { enabled: bonoNocturnoHoras > 0, cantidad: bonoNocturnoHoras, montoUnitario: salarioHora * 0.3 },
      turnosLaborados: { ...baseConfig.turnosLaborados, enabled: false },
      bonoJornadaMixta: { enabled: bonoJornadaMixta > 0, cantidad: bonoJornadaMixta, montoUnitario: salarioHora * 0.3 },
      horasExtrasNocturnas: { enabled: hoursData.totalExtraNocturna > 0, cantidad: hoursData.totalExtraNocturna, montoUnitario: salarioHora * 1.95 },
      diasCompensatorios: { ...baseConfig.diasCompensatorios, enabled: false, cantidad: 0 },
      sabadoLaborado: { enabled: sabadoLaborado > 0, cantidad: sabadoLaborado, montoUnitario: salarioDiario },
      bonoAlimentacion: { enabled: false, cantidad: 0, montoUnitario: 0 },
      otrasAsignaciones: { ...baseConfig.otrasAsignaciones, enabled: false, cantidad: 0, montoUnitario: 0 },
      vales: { ...baseConfig.vales, enabled: false, cantidad: 0, montoUnitario: 0 },
      sso: { enabled: calc.deduccion_ivss > 0, cantidad: 1, montoUnitario: calc.deduccion_ivss },
      rpe: { enabled: calc.deduccion_spf > 0, cantidad: 1, montoUnitario: calc.deduccion_spf },
      faov: { enabled: calc.deduccion_faov > 0, cantidad: 1, montoUnitario: calc.deduccion_faov },
      islr: { ...baseConfig.islr, enabled: false, cantidad: 0, montoUnitario: 0 },
      adelantoNomina: { enabled: tieneAdelanto && autoAdelantoNomina > 0, cantidad: 1, montoUnitario: autoAdelantoNomina },
      prestamo: { enabled: tienePrestamo && autoPrestamoCredito > 0, cantidad: 1, montoUnitario: autoPrestamoCredito },
    };
  };

  const handleResetAllReceiptConfigs = async () => {
    const filteredEmps = employees.filter(emp => selectedBranchId ? emp.sucursal_id === selectedBranchId : true);

    if (filteredEmps.length === 0) {
      alert('No hay empleados para restablecer.');
      return;
    }

    if (!confirm(`¿Restablecer la configuración de recibo de ${filteredEmps.length} empleado(s) con los valores calculados desde asistencias (días laborados, horas extras, deducciones, etc.)?`)) return;

    setResettingAllReceipts(true);
    try {
      const configMap = new Map<string, ReceiptPrintConfig>();
      const updates = filteredEmps.map(emp => {
        const fullConfig = buildFullReceiptConfigFromAttendance(emp);
        if (!fullConfig) return null;
        configMap.set(emp.id, fullConfig);
        return supabase
          .from('empleados')
          .update({ receipt_print_config: fullConfig })
          .eq('id', emp.id);
      }).filter(Boolean);

      const results = await Promise.all(updates);
      const errors = results.filter(r => r && r.error);

      if (errors.length > 0) {
        console.error('Errores al restablecer recibos:', errors);
        alert(`Se restablecieron ${filteredEmps.length - errors.length} de ${filteredEmps.length} recibos. Hubo ${errors.length} error(es).`);
      } else {
        alert(`Se restablecieron los recibos de ${filteredEmps.length} empleado(s) correctamente.`);
      }

      setEmployees(prev => prev.map(emp => {
        const newConfig = configMap.get(emp.id);
        return newConfig ? { ...emp, receipt_print_config: newConfig } : emp;
      }));
    } catch (error) {
      console.error(error);
      alert('Error al restablecer las configuraciones de recibo.');
    } finally {
      setResettingAllReceipts(false);
    }
  };

  const getEffectiveReceiptConfig = (emp?: Empleado): ReceiptPrintConfig => {
    if (emp && emp.receipt_print_config && Object.keys(emp.receipt_print_config).length > 0) {
      return normalizeReceiptPrintConfig(emp.receipt_print_config);
    }
    return config?.receipt_print_config ? normalizeReceiptPrintConfig(config.receipt_print_config) : defaultReceiptConfig;
  };

  const buildAttendanceDrivenReceiptConfig = (emp: Empleado): ReceiptPrintConfig => {
    const baseConfig = getEffectiveReceiptConfig(emp);
    if (!config) return baseConfig;

    const empAsistencias = attendances.filter((a) => a.empleado_id === emp.id);
    const hoursData = processAttendanceRecords(empAsistencias);
    const calcBase = calculatePayroll(emp, config, 15, periodo);
    const salarioDiario = calcBase.salario_diario_normal;
    const salarioHora = salarioDiario / 8;

    const presentRecords = empAsistencias.filter(
      (att) => att.estado === 'presente' && att.hora_entrada && att.hora_salida
    );

    // Cache local de feriados por año tocado por el período en curso.
    const holidaysByYear: Record<number, Record<string, { name: string; detail: string }>> = {};
    const isHolidayDate = (fecha: string) => {
      const year = Number(fecha.slice(0, 4));
      if (!Number.isFinite(year)) return false;
      if (!holidaysByYear[year]) holidaysByYear[year] = getVenezuelanHolidays(year);
      return Boolean(holidaysByYear[year][fecha]);
    };

    const feriadosLaboradosCount = presentRecords.filter((att) => isHolidayDate(att.fecha)).length;
    // Domingos/sábados que NO sean feriado: evita doble pago con feriadosLaborados (Art. 120).
    const domingoLaborado = presentRecords.filter(
      (att) => new Date(`${att.fecha}T00:00:00`).getDay() === 0 && !isHolidayDate(att.fecha)
    ).length;
    const sabadoLaborado = presentRecords.filter(
      (att) => new Date(`${att.fecha}T00:00:00`).getDay() === 6 && !isHolidayDate(att.fecha)
    ).length;

    // Horas de jornada mixta: solo las horas nocturnas de turnos clasificados como Mixta
    const bonoJornadaMixta = presentRecords.reduce((sum, att) => {
      const shift = calculateDetailedShift(att.hora_entrada || '', att.hora_salida || '', att.fecha);
      return shift.shiftType === 'Mixta' ? sum + shift.nightHours : sum;
    }, 0);

    // Bono nocturno "puro" = totalNightHours menos las horas de turnos Mixta (que ya se pagan en bonoJornadaMixta).
    // Evita doble conteo del recargo 30% Art. 117.
    const bonoNocturnoHoras = Math.max(0, hoursData.totalNightHours - bonoJornadaMixta);

    // Días laborados / descanso: el esquema 11+4 (ver `defaultReceiptConfig`) es FIJO y
    // editable solo desde el modal de Configurar Recibo (global o por empleado). NO se
    // recalcula desde asistencia para garantizar uniformidad entre trabajadores
    // (turneros etc.). Las inasistencias se reflejan vía cestaticket / deducciones manuales.

    // Verificar si tiene adelantos/préstamos activos
    const empAdelantos = adelantos.filter(a => a.empleado_id === emp.id && a.estado === 'aprobado');
    const tieneAdelanto = empAdelantos.some(a => a.tipo === 'adelanto_nomina');
    const tienePrestamo = empAdelantos.some(a => a.tipo === 'prestamo_credito');

    const withAutoValues = (key: keyof ReceiptPrintConfig, cantidad: number, montoUnitario: number) => ({
      ...baseConfig[key],
      enabled: cantidad > 0,
      cantidad,
      montoUnitario,
    });

    // diasLaborados / diasDescanso: cantidad fija desde baseConfig (lo que el admin
    // configuró). montoUnitario = salarioDiario actualizado al período. enabled = true
    // siempre para que el recibo siempre muestre la base salarial de la quincena.
    const diasLaboradosCantidad = baseConfig.diasLaborados?.cantidad ?? 11;
    const diasDescansoCantidad = baseConfig.diasDescanso?.cantidad ?? 4;

    return {
      ...baseConfig,
      diasLaborados: { ...baseConfig.diasLaborados, enabled: true, cantidad: diasLaboradosCantidad, montoUnitario: salarioDiario },
      diasDescanso: { ...baseConfig.diasDescanso, enabled: true, cantidad: diasDescansoCantidad, montoUnitario: salarioDiario },
      // descansoLaborado se deja deshabilitado: usamos sabadoLaborado y domingoLaborado por separado para evitar doble conteo
      descansoLaborado: { ...baseConfig.descansoLaborado, enabled: false, cantidad: 0 },
      domingoLaborado: withAutoValues('domingoLaborado', domingoLaborado, salarioDiario * 1.5),
      sabadoLaborado: withAutoValues('sabadoLaborado', sabadoLaborado, salarioDiario),
      feriadosLaborados: withAutoValues('feriadosLaborados', feriadosLaboradosCount, salarioDiario * 1.5),
      horasExtrasDiurnas: withAutoValues('horasExtrasDiurnas', hoursData.totalExtraDiurna, salarioHora * 1.5),
      bonoNocturno: withAutoValues('bonoNocturno', bonoNocturnoHoras, salarioHora * 0.3),
      // turnosLaborados no se auto-habilita (no se usa en el cálculo LOTTT)
      turnosLaborados: { ...baseConfig.turnosLaborados, enabled: false },
      bonoJornadaMixta: withAutoValues('bonoJornadaMixta', bonoJornadaMixta, salarioHora * 0.3),
      horasExtrasNocturnas: withAutoValues('horasExtrasNocturnas', hoursData.totalExtraNocturna, salarioHora * 1.95),
      bonoAlimentacion: { ...baseConfig.bonoAlimentacion, enabled: hoursData.diasTrabajados > 0 || baseConfig.bonoAlimentacion.enabled },
      adelantoNomina: { ...baseConfig.adelantoNomina, enabled: tieneAdelanto },
      prestamo: { ...baseConfig.prestamo, enabled: tienePrestamo },
    };
  };

  const getPayrollBreakdown = (emp: Empleado) => {
    if (!config) return null;

    // Regenera items dependientes de asistencia por cada período activo (Q1/Q2).
    // Items no-asistencia (otrasAsignaciones, vales, islr, etc.) se conservan de la plantilla guardada.
    const effectiveConfig = buildAttendanceDrivenReceiptConfig(emp);

    const empAsistencias = attendances.filter(a => a.empleado_id === emp.id);
    const hoursData = processAttendanceRecords(empAsistencias);
    const usaCalculoAsistencia = hoursData.diasTrabajados > 0;

    const calcBase = calculatePayroll(emp, config, 15, periodo);
    const salarioDiario = calcBase.salario_diario_normal;
    const salarioHora = salarioDiario / 8;

    const getValue = (item: any, defaultMonto: number, defaultCantidad: number) => {
       if (!item || !item.enabled) return { total: 0, qty: 0, unit: 0 };
       const qty = item.cantidad ?? defaultCantidad;
       const unit = item.montoUnitario || defaultMonto;
       return { total: qty * unit, qty, unit };
    };

    // Horas Mixta se descuentan del bono nocturno para evitar doble pago del recargo 30% (Art. 117).
    const horasJornadaMixtaDefault = empAsistencias.reduce((sum, att) => {
      if (att.estado !== 'presente' || !att.hora_entrada || !att.hora_salida) return sum;
      const shift = calculateDetailedShift(att.hora_entrada, att.hora_salida, att.fecha);
      return shift.shiftType === 'Mixta' ? sum + shift.nightHours : sum;
    }, 0);
    const bonoNocDefault = Math.max(0, hoursData.totalNightHours - horasJornadaMixtaDefault);

    // Fórmulas LOTTT estricto
    // diasLaborados / diasDescanso vienen FIJOS desde effectiveConfig (esquema 11+4 editable
    // por admin). Ya no dependen de la asistencia real para garantizar uniformidad entre
    // trabajadores (turneros, etc.).
    const cLaborados = getValue(effectiveConfig.diasLaborados, salarioDiario, effectiveConfig.diasLaborados?.cantidad ?? 11);
    const cDescanso = getValue(effectiveConfig.diasDescanso, salarioDiario, effectiveConfig.diasDescanso?.cantidad ?? 4);
    // descansoLaborado: el umbral usa los días laborados efectivos del config (no
    // de asistencia). Con 11 fijo no dispara automático — queda bajo control manual.
    const diasLaboradosConfig = effectiveConfig.diasLaborados?.cantidad ?? 11;
    const descansoLabHabilitado = diasLaboradosConfig > 11 ? effectiveConfig.descansoLaborado : { ...effectiveConfig.descansoLaborado, enabled: false };
    const cDescansoLab = getValue(descansoLabHabilitado, salarioDiario * 1.5, 0); // Art. 120: 50% recargo — solo si dias > 11
    const cDomLab = getValue(effectiveConfig.domingoLaborado, salarioDiario * 1.5, 0); // Art. 120
    const cExtDiur = getValue(effectiveConfig.horasExtrasDiurnas, salarioHora * 1.5, hoursData.totalExtraDiurna); // Art. 118
    const cFerLab = getValue(effectiveConfig.feriadosLaborados, salarioDiario * 1.5, 0); // Art. 120
    const cBonoNoc = getValue(effectiveConfig.bonoNocturno, salarioHora * 0.30, bonoNocDefault); // Art. 117 (excluye horas Mixta)
    const cTurnos = { total: 0, qty: 0, unit: 0 }; // Desactivado
    const cBonoMix = getValue(effectiveConfig.bonoJornadaMixta, salarioHora * 0.30, horasJornadaMixtaDefault);
    const cExtNoc = getValue(effectiveConfig.horasExtrasNocturnas, salarioHora * 1.95, hoursData.totalExtraNocturna); // Art. 117 y 118: (1.30 * 1.5)
    const cCompens = { total: 0, qty: 0, unit: 0 }; // Desactivado
    const cSabLab = { total: 0, qty: 0, unit: 0 }; // Desactivado
    const cCesta = getValue(effectiveConfig.bonoAlimentacion, calcBase.bono_alimentacion_vef, 1);
    const cOtras = getValue(effectiveConfig.otrasAsignaciones, 0, 1);

    // Cestaticket se maneja en recibo aparte — no entra al totalAsignaciones ni al neto de este recibo.
    const totalAsignaciones = cLaborados.total + cDescanso.total + cDescansoLab.total + cDomLab.total + cExtDiur.total + cFerLab.total + cBonoNoc.total + cTurnos.total + cBonoMix.total + cExtNoc.total + cCompens.total + cSabLab.total + cOtras.total;

    // Deducciones sobre totalAsignaciones (que ya excluye cestaticket: art. 105 LOTTT, no remunerativo)
    const calc = calculatePayroll(emp, config, 15, periodo, totalAsignaciones);


    // Deducciones legales y adelantos: siempre se recalculan al período actual.
    // Los montos guardados en effectiveConfig pueden ser stale (p.ej. IVSS de Q1), así que
    // solo respetamos el flag `enabled`; el monto viene de calc.deduccion_* / adelantos auto.
    const autoDeductionCell = (enabled: boolean | undefined, amount: number) =>
      (enabled ?? true) && amount > 0
        ? { total: amount, qty: 1, unit: amount }
        : { total: 0, qty: 0, unit: 0 };

    const cIvss = autoDeductionCell(effectiveConfig.sso?.enabled, calc.deduccion_ivss);
    const cSpf = autoDeductionCell(effectiveConfig.rpe?.enabled, calc.deduccion_spf);
    const cFaov = autoDeductionCell(effectiveConfig.faov?.enabled, calc.deduccion_faov);
    const cIslr = getValue(effectiveConfig.islr, 0, 1);
    const cVales = getValue(effectiveConfig.vales, 0, 1);

    const deduccionIvss = cIvss.total;
    const deduccionSpf = cSpf.total;
    const deduccionFaov = cFaov.total;

    const maxAdelantosPermitido = Math.max(0, totalAsignaciones - (cIvss.total + cSpf.total + cFaov.total + cIslr.total + cVales.total));
    const adelantosCalculados = getAdelantosForPeriod(emp.id, maxAdelantosPermitido);

    const autoAdelantoNomina = adelantosCalculados.aplicados
      .filter((item) => item.tipo === 'adelanto_nomina')
      .reduce((sum, item) => sum + item.deducted, 0);
    const autoPrestamoCredito = adelantosCalculados.aplicados
      .filter((item) => item.tipo === 'prestamo_credito')
      .reduce((sum, item) => sum + item.deducted, 0);

    const cAdelantoNomina = autoDeductionCell(effectiveConfig.adelantoNomina?.enabled, autoAdelantoNomina);
    const cPrestamo = autoDeductionCell(effectiveConfig.prestamo?.enabled, autoPrestamoCredito);

    const totalAdelantoNomina = cAdelantoNomina.total;
    const totalPrestamoCredito = cPrestamo.total;
    const totalAdelantos = totalAdelantoNomina + totalPrestamoCredito;

    const totalDeducciones = cIvss.total + cSpf.total + cFaov.total + cIslr.total + cVales.total + totalAdelantos;
    const neto = totalAsignaciones - totalDeducciones;

    return {
      calc,
      effectiveConfig,
      hoursData,
      usaCalculoAsistencia,
      cLaborados, cDescanso, cDescansoLab, cDomLab, cExtDiur, cFerLab, cBonoNoc, cTurnos, cBonoMix, cExtNoc, cCompens, cSabLab, cCesta, cOtras,
      cIvss, cSpf, cFaov, cIslr, cVales, cAdelantoNomina, cPrestamo,
      montoHorasNormales: cLaborados.total,
      montoCestaticket: cCesta.total,
      montoExtrasDiurnas: cExtDiur.total,
      montoExtrasNocturnas: cExtNoc.total,
      montoBonoNocturno: cBonoNoc.total,
      deduccionIvss,
      deduccionSpf,
      deduccionFaov,
      adelantosAplicados: adelantosCalculados.aplicados,
      totalAdelantos,
      totalAdelantoNomina,
      totalPrestamoCredito,
      totalAsignaciones,
      totalDeducciones,
      neto,
    };
  };

  const generatePDF = async (emp: Empleado, breakdownInput: ReturnType<typeof getPayrollBreakdown>, doc?: jsPDF) => {
    if (!config || !breakdownInput) return;

    const isGlobal = !!doc;
    const pdf = doc || new jsPDF({ format: 'legal' });

    const {
      calc,
      effectiveConfig,
      cLaborados, cDescanso, cDescansoLab, cDomLab, cExtDiur, cFerLab, cBonoNoc, cTurnos, cBonoMix, cExtNoc, cCompens, cSabLab, cCesta, cOtras,
      cIvss, cSpf, cFaov, cIslr, cVales, cAdelantoNomina, cPrestamo,
      totalAdelantos, totalAdelantoNomina, totalPrestamoCredito, neto
    } = breakdownInput;

    const startDay = periodo === 'Q1' ? 1 : 16;
    const endDay = periodo === 'Q1' ? 15 : new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const fechaDesde = `${startDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;
    const fechaHasta = `${endDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;

    const pageWidth = pdf.internal.pageSize.width;
    const fechaEmision = new Date().toLocaleString('es-VE');

    const drawReceipt = (offsetY: number) => {

    // --- Header ---
    try {
        const imgWidth = 25;
        pdf.addImage(LOGO_URL, 'JPEG', 15, offsetY + 15, imgWidth, 15);
    } catch (e) {}

    pdf.setFont("courier", "bold");
    pdf.setFontSize(14);
    pdf.text("RECIBO DE PAGO DE NÓMINA", pageWidth / 2, offsetY + 25, { align: "center" });

    pdf.setFontSize(8);
    pdf.setFont("courier", "normal");
    pdf.text(`Emisión: ${fechaEmision}`, pageWidth - 15, offsetY + 15, { align: "right" });

    let y = offsetY + 45;
    pdf.setFontSize(9);

    // El recibo siempre muestra UNA sola empresa: la sucursal donde el empleado
    // realmente labora. Solo cae a la sucursal principal si el empleado no tiene
    // sucursal asignada.
    const empresaHeader = emp.sucursales?.nombre_id || principalBranch?.nombre_id || 'FarmaNomina C.A.';
    const rifHeader = emp.sucursales?.rif || principalBranch?.rif || 'J-12345678-9';

    pdf.text(`EMPRESA: ${empresaHeader}`, 15, y);
    pdf.text(`RIF: ${rifHeader}`, pageWidth - 15, y, { align: "right" });
    y += 6;

    pdf.setFont("courier", "bold");
    pdf.text(`TRABAJADOR: ${emp.nombre} ${emp.apellido}`, 15, y);
    pdf.text(`C.I.: ${emp.cedula}`, pageWidth - 15, y, { align: "right" });
    y += 4;
    pdf.setFont("courier", "normal");
    pdf.text(`Cargo: ${emp.cargo || 'General'}`, 15, y);
    pdf.text(`Período: ${fechaDesde} al ${fechaHasta}`, pageWidth - 15, y, { align: "right" });
    y += 4;
    const fechaIngresoFmt = (() => {
      if (!emp.fecha_ingreso) return 'N/D';
      const [yy, mm, dd] = emp.fecha_ingreso.split('-');
      return yy && mm && dd ? `${dd}/${mm}/${yy}` : emp.fecha_ingreso;
    })();
    pdf.text(`Fecha Ingreso: ${fechaIngresoFmt}`, 15, y);
    pdf.text(`Salario Diario (Bs): ${Number(calc.salario_diario_normal).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, pageWidth - 15, y, { align: "right" });
    y += 4;
    pdf.text(`Salario Base Mensual (Bs): ${Number(calc.sueldo_base_mensual).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 15, y);
    y += 6;

    // Tabla Conceptos
    pdf.setFont("courier", "bold");
    pdf.text("CONCEPTO", 15, y);
    pdf.text("CANT", 110, y, { align: "right" });
    pdf.text("ASIGNACIONES", 150, y, { align: "right" });
    pdf.text("DEDUCCIONES", 195, y, { align: "right" });
    y += 4;
    pdf.line(15, y, pageWidth - 15, y);
    y += 4;
    pdf.setFont("courier", "normal");

    const cleanAmount = (value: number | null | undefined) => {
        if (value === null || value === undefined) return 0;
        return Math.abs(value) < 0.005 ? 0 : Number(value.toFixed(2));
    };

    const formatQty = (value: number | string, unit = '') => {
        if (typeof value === 'string') return value;
        const cleanValue = cleanAmount(value);
        if (cleanValue === 0) return '';
        const text = Number.isInteger(cleanValue)
          ? cleanValue.toString()
          : cleanValue.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        return unit ? `${text} ${unit}` : text;
    };

    const addRow = (
      concepto: string,
      cant: number | string,
      asignacion: number | null,
      deduccion: number | null,
      hideIfZero: boolean = true
    ) => {
        const safeAsignacion = cleanAmount(asignacion);
        const safeDeduccion = cleanAmount(deduccion);
        const safeCant = typeof cant === 'number' ? cleanAmount(cant) : cant;

        if (hideIfZero && safeAsignacion === 0 && safeDeduccion === 0 && (safeCant === 0 || safeCant === '')) {
          return;
        }

        pdf.text(concepto.substring(0, 45), 15, y);
        if (safeCant !== '') pdf.text(`${safeCant}`, 110, y, { align: "right" });
        if (safeAsignacion > 0) pdf.text(`${safeAsignacion.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 150, y, { align: "right" });
        if (safeDeduccion > 0) pdf.text(`${safeDeduccion.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 195, y, { align: "right" });
        y += 4;
    };

    // Helper: la columna CANT muestra siempre el monto en Bs (sin la palabra "dias"
    // ni "turnos") para que el recibo quede uniforme con las filas de horas/bonos.
    const fmtBs = (v: number) => v > 0 ? v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

    if (effectiveConfig.diasLaborados?.enabled) addRow(`Dias laborados (${cLaborados.qty})`, fmtBs(cLaborados.total), cLaborados.total, null);
    if (effectiveConfig.diasDescanso?.enabled) addRow(`Dias de descanso (${cDescanso.qty})`, fmtBs(cDescanso.total), cDescanso.total, null);
    if (effectiveConfig.descansoLaborado?.enabled) addRow("Descanso laborado", fmtBs(cDescansoLab.total), cDescansoLab.total, null);
    if (effectiveConfig.domingoLaborado?.enabled) addRow("Domingo laborado", fmtBs(cDomLab.total), cDomLab.total, null);
    if (effectiveConfig.horasExtrasDiurnas?.enabled) addRow("Bono extra diurno", fmtBs(cExtDiur.total), cExtDiur.total, null);
    if (effectiveConfig.feriadosLaborados?.enabled) addRow("Feriado laborado", fmtBs(cFerLab.total), cFerLab.total, null);
    if (effectiveConfig.bonoNocturno?.enabled) addRow("Bono por Jornada Nocturna Art 117", fmtBs(cBonoNoc.total), cBonoNoc.total, null);
    if (effectiveConfig.turnosLaborados?.enabled) addRow("Turnos laborados", fmtBs(cTurnos.total), cTurnos.total, null);
    if (effectiveConfig.bonoJornadaMixta?.enabled) addRow("Bono jornada mixta", fmtBs(cBonoMix.total), cBonoMix.total, null);
    if (effectiveConfig.horasExtrasNocturnas?.enabled) addRow("Bono extra nocturno", fmtBs(cExtNoc.total), cExtNoc.total, null);
    if (effectiveConfig.diasCompensatorios?.enabled) addRow("Dias compensatorios", fmtBs(cCompens.total), cCompens.total, null);
    if (effectiveConfig.sabadoLaborado?.enabled) addRow("Sabado laborado", fmtBs(cSabLab.total), cSabLab.total, null);
    // Bono Alimentación (Cestaticket) ahora se emite en un recibo aparte.
    if (effectiveConfig.otrasAsignaciones?.enabled) addRow("Otras asignaciones", cOtras.qty > 0 ? formatQty(cOtras.qty) : "", cOtras.total, null);

    if (effectiveConfig.sso?.enabled) addRow("Seguro Social Obligatorio (S.S.O)", "4%", null, cIvss.total);
    if (effectiveConfig.rpe?.enabled) addRow("Regimen prestacional de empleo", "0.5%", null, cSpf.total);
    if (effectiveConfig.faov?.enabled) addRow("FAOV", "1%", null, cFaov.total);
    if (effectiveConfig.islr?.enabled) addRow("Retencion ISLR", cIslr.qty > 0 ? cIslr.qty + "%" : "", null, cIslr.total);
    if (effectiveConfig.vales?.enabled) addRow("Vales", "", null, cVales.total);

    if (effectiveConfig.adelantoNomina?.enabled && cAdelantoNomina.total > 0) {
        addRow("Adelanto de nomina", "", null, cAdelantoNomina.total);
    }
    if (effectiveConfig.prestamo?.enabled && cPrestamo.total > 0) {
        addRow("Prestamo / credito", "", null, cPrestamo.total);
    }

    y += 4;
    pdf.line(15, y, pageWidth - 15, y);
    y += 4;
    pdf.setFont("courier", "bold");
    pdf.text("TOTAL NETO A RECIBIR (Bs.):", 15, y);
    pdf.text(`${neto.toLocaleString('es-VE', {minimumFractionDigits: 2})}`, 150, y, { align: "right" });

    // Footer firmas
    y += 15;

    pdf.line(20, y, 90, y);
    pdf.text("Firma Trabajador", 35, y + 5);

    pdf.line(120, y, 190, y);
    pdf.text("Firma Empleador", 135, y + 5);


        };

    drawReceipt(0);
    // Línea de corte
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(5, 177, pageWidth - 5, 177);
    pdf.setLineDashPattern([], 0);
    pdf.setFontSize(6);
    pdf.text("-------------------------------------- Corte por aquí --------------------------------------", pageWidth / 2, 177, { align: "center" });

    drawReceipt(178);

    if (!isGlobal) {
        window.open(URL.createObjectURL(pdf.output("blob")), "_blank");
    }
  };

  // Calcula el monto de cestaticket del período: mensual proporcional a faltas injustificadas.
  // Se paga una vez al mes (Q2), pero el recibo individual lo emite siempre con el monto mensual completo.
  const calcularCestaticketEmpleado = (emp: Empleado) => {
    if (!config) return { monto: 0, faltas: 0, diasEfectivos: 30 };
    const tasa = Number(config.tasa_bcv) || 0;
    const cestaMensual = (Number(config.cestaticket_usd) || 0) * tasa;
    // Contar faltas injustificadas del mes
    const primerDia = formatLocalDateKey(new Date(selectedYear, selectedMonth, 1));
    const ultimoDia = formatLocalDateKey(new Date(selectedYear, selectedMonth + 1, 0));
    const faltas = attendances.filter(a =>
      a.empleado_id === emp.id &&
      a.fecha >= primerDia &&
      a.fecha <= ultimoDia &&
      a.estado === 'falta'
    ).length;
    const diasEfectivos = Math.max(0, 30 - faltas);
    const factor = Math.max(0, Math.min(1, diasEfectivos / 30));
    return { monto: cestaMensual * factor, faltas, diasEfectivos };
  };

  const drawCestaticketReceipt = (pdf: jsPDF, emp: Empleado, offsetY: number) => {
    const pageWidth = pdf.internal.pageSize.width;
    const fechaEmision = new Date().toLocaleString('es-VE');
    const mesNombre = meses[selectedMonth];
    const { monto, faltas, diasEfectivos } = calcularCestaticketEmpleado(emp);

    try {
      pdf.addImage(LOGO_URL, 'JPEG', 15, offsetY + 15, 25, 15);
    } catch (e) {}

    pdf.setFont("courier", "bold");
    pdf.setFontSize(14);
    pdf.text("RECIBO DE BONO ALIMENTACIÓN (CESTATICKET)", pageWidth / 2, offsetY + 25, { align: "center" });

    pdf.setFontSize(8);
    pdf.setFont("courier", "normal");
    pdf.text(`Emisión: ${fechaEmision}`, pageWidth - 15, offsetY + 15, { align: "right" });

    let y = offsetY + 45;
    pdf.setFontSize(9);

    // Una sola empresa: la sucursal donde el empleado realmente labora.
    const empresaHeader = emp.sucursales?.nombre_id || principalBranch?.nombre_id || 'FarmaNomina C.A.';
    const rifHeader = emp.sucursales?.rif || principalBranch?.rif || 'J-12345678-9';

    pdf.text(`EMPRESA: ${empresaHeader}`, 15, y);
    pdf.text(`RIF: ${rifHeader}`, pageWidth - 15, y, { align: "right" });
    y += 6;

    pdf.setFont("courier", "bold");
    pdf.text(`TRABAJADOR: ${emp.nombre} ${emp.apellido}`, 15, y);
    pdf.text(`C.I.: ${emp.cedula}`, pageWidth - 15, y, { align: "right" });
    y += 4;
    pdf.setFont("courier", "normal");
    pdf.text(`Cargo: ${emp.cargo || 'General'}`, 15, y);
    pdf.text(`Mes: ${mesNombre} ${selectedYear}`, pageWidth - 15, y, { align: "right" });
    y += 4;
    const fechaIngresoCestaFmt = (() => {
      if (!emp.fecha_ingreso) return 'N/D';
      const [yy, mm, dd] = emp.fecha_ingreso.split('-');
      return yy && mm && dd ? `${dd}/${mm}/${yy}` : emp.fecha_ingreso;
    })();
    pdf.text(`Fecha Ingreso: ${fechaIngresoCestaFmt}`, 15, y);
    y += 8;

    pdf.setFont("courier", "bold");
    pdf.text("CONCEPTO", 15, y);
    pdf.text("DETALLE", 110, y);
    pdf.text("MONTO (Bs.)", pageWidth - 15, y, { align: "right" });
    y += 4;
    pdf.line(15, y, pageWidth - 15, y);
    y += 5;

    pdf.setFont("courier", "normal");
    pdf.text("Bono Alimentación (Cestaticket)", 15, y);
    pdf.text(`${diasEfectivos}/30 días`, 110, y);
    pdf.text(monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), pageWidth - 15, y, { align: "right" });
    y += 4;

    if (faltas > 0) {
      pdf.setFontSize(8);
      pdf.text(`(Descuento por ${faltas} falta(s) injustificada(s))`, 15, y);
      pdf.setFontSize(9);
      y += 4;
    }

    y += 4;
    pdf.line(15, y, pageWidth - 15, y);
    y += 5;

    pdf.setFont("courier", "bold");
    pdf.text("TOTAL A RECIBIR (Bs.):", 15, y);
    pdf.text(monto.toLocaleString('es-VE', { minimumFractionDigits: 2 }), pageWidth - 15, y, { align: "right" });

    y += 10;
    pdf.setFont("courier", "normal");
    pdf.setFontSize(7);
    pdf.text("Base legal: Ley del Régimen Prestacional de Empleo — Bono Alimentación.", 15, y);
    pdf.text("No forma parte del salario (Art. 105 LOTTT).", 15, y + 3);

    y += 15;
    pdf.line(20, y, 90, y);
    pdf.setFontSize(9);
    pdf.text("Firma Trabajador", 35, y + 5);
    pdf.line(120, y, 190, y);
    pdf.text("Firma Empleador", 135, y + 5);
  };

  const generateCestaticketPDF = async (emp: Empleado, doc?: jsPDF) => {
    if (!config) return;
    const isGlobal = !!doc;
    const pdf = doc || new jsPDF({ format: 'legal' });
    const pageWidth = pdf.internal.pageSize.width;

    drawCestaticketReceipt(pdf, emp, 0);

    // Línea de corte (dos copias por página)
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(5, 177, pageWidth - 5, 177);
    pdf.setLineDashPattern([], 0);
    pdf.setFontSize(6);
    pdf.text("-------------------------------------- Corte por aquí --------------------------------------", pageWidth / 2, 177, { align: "center" });

    drawCestaticketReceipt(pdf, emp, 178);

    if (!isGlobal) {
      window.open(URL.createObjectURL(pdf.output("blob")), "_blank");
    }
  };

  const generateCestaticketGlobalPDF = async () => {
    if (!config) return;
    const doc = new jsPDF({ format: 'legal' });
    const filteredEmps = employees.filter(emp =>
      (selectedBranchId ? emp.sucursal_id === selectedBranchId : true) && !excludedEmployees[emp.id]
    );

    if (filteredEmps.length === 0) {
      alert('No hay empleados para generar recibos de cestaticket.');
      return;
    }

    let isFirstPage = true;
    for (const emp of filteredEmps) {
      if (!isFirstPage) doc.addPage();
      await generateCestaticketPDF(emp, doc);
      isFirstPage = false;
    }

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

  // ──────────────────────────────────────────────────────────────────
  // Listado Cestaticket (para firmas) — formato consolidado en una hoja
  // ──────────────────────────────────────────────────────────────────

  // Devuelve los empleados que entrarían al listado: respeta el filtro de sucursal
  // global (selectedBranchId) y los empleados excluidos del prorrateo.
  const getCestaListEmpleados = () =>
    employees.filter(emp =>
      (selectedBranchId ? emp.sucursal_id === selectedBranchId : true) && !excludedEmployees[emp.id]
    );

  // Abre el modal con valores por defecto: fecha = último día del mes seleccionado,
  // USD por empleado = cestaticket_usd × diasEfectivos/30 (mismo cálculo que el recibo).
  const openCestaListModal = () => {
    if (!config) return;
    const filteredEmps = getCestaListEmpleados();
    if (filteredEmps.length === 0) {
      alert('No hay empleados para generar el listado de cestaticket.');
      return;
    }
    const cestaUsdMensual = Number(config.cestaticket_usd) || 0;
    const defaults: Record<string, string> = {};
    filteredEmps.forEach(emp => {
      const { diasEfectivos } = calcularCestaticketEmpleado(emp);
      const usd = cestaUsdMensual * (diasEfectivos / 30);
      defaults[emp.id] = usd.toFixed(2);
    });
    setCestaListUsd(defaults);
    // Default: último día del mes seleccionado (consistente con el modelo de la foto).
    setCestaListFecha(formatLocalDateKey(new Date(selectedYear, selectedMonth + 1, 0)));
    setShowCestaListModal(true);
  };

  const generateCestaticketListadoPDF = async () => {
    if (!config) return;
    const filteredEmps = getCestaListEmpleados();
    if (filteredEmps.length === 0) {
      alert('No hay empleados para generar el listado.');
      return;
    }

    const tasa = Number(config.tasa_bcv) || 0;
    const cestaUsdMensual = Number(config.cestaticket_usd) || 0;

    // Legal landscape: más ancho útil para una tabla con firma cómoda.
    const pdf = new jsPDF({ format: 'legal', orientation: 'landscape' });
    const pageWidth = pdf.internal.pageSize.width;

    // Logo opcional (no es bloqueante)
    try {
      pdf.addImage(LOGO_URL, 'JPEG', 15, 10, 22, 14);
    } catch (e) {}

    // Encabezado: sucursal del filtro activo si hay; si no, sucursal principal
    const sucHeader = selectedBranchId
      ? branches.find(b => b.id === selectedBranchId)
      : principalBranch;
    const empresaHeader = sucHeader?.nombre_id || principalBranch?.nombre_id || 'FarmaNomina C.A.';
    const rifHeader = sucHeader?.rif || principalBranch?.rif || 'J-12345678-9';
    const mesNombre = meses[selectedMonth];

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(empresaHeader, 42, 17);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`RIF: ${rifHeader}`, 42, 22);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`CESTA TICKET ${mesNombre.toUpperCase()} ${selectedYear}`, 42, 27);

    // Fecha editable (ya viene en YYYY-MM-DD desde el modal)
    const fechaFmt = (() => {
      if (!cestaListFecha) return '';
      const [yy, mm, dd] = cestaListFecha.split('-');
      return yy && mm && dd ? `${dd}-${mm}-${yy}` : cestaListFecha;
    })();
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Fecha: ${fechaFmt}`, 42, 32);

    // Filas
    let totalBs = 0;
    const body = filteredEmps.map(emp => {
      const usd = parseFloat(cestaListUsd[emp.id] ?? '0') || 0;
      const bs = usd * tasa;
      totalBs += bs;
      const fIngreso = (() => {
        if (!emp.fecha_ingreso) return '';
        const [yy, mm, dd] = emp.fecha_ingreso.split('-');
        return yy && mm && dd ? `${Number(dd)}/${Number(mm)}/${yy}` : emp.fecha_ingreso;
      })();
      return [
        fIngreso,
        emp.cedula || '',
        `${emp.nombre || ''} ${emp.apellido || ''}`.trim().toUpperCase(),
        bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        '', // Firma (en blanco)
      ];
    });

    // Tabla con autoTable (auto-paginado, repite header)
    const autoTable = (pdf as any).autoTable;
    autoTable.call(pdf, {
      startY: 40,
      head: [[
        'FECHA DE INGRESO',
        'CEDULA',
        'NOMBRE Y APELLIDO',
        `${cestaUsdMensual} $ × Tasa BCV`,
        'FIRMA',
      ]],
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 3,
        lineColor: [60, 60, 60],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [20, 20, 20],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 35, halign: 'center' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 90 },
        3: { cellWidth: 45, halign: 'right' },
        4: { cellWidth: 'auto', minCellHeight: 12 }, // alta para firmar
      },
      margin: { left: 15, right: 15 },
    });

    // Total al pie (debajo de la última posición de autoTable)
    const finalY = (pdf as any).lastAutoTable?.finalY ?? 40;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(
      `TOTAL: ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      pageWidth - 18,
      finalY + 8,
      { align: 'right' }
    );

    window.open(URL.createObjectURL(pdf.output('blob')), '_blank');
  };

  const generateReceipt2PDF = async (data: any, doc?: jsPDF) => {
    const isGlobal = !!doc;
    const pdf = doc || new jsPDF({ format: 'legal' });
    const { emp, totalHrs, maxPote, bonoBs, bonoUsd, customAssignUsd, customDeductUsd, totalNetoUsd, totalNetoBs, horasBaseQuincena, tasa, extraAssignName } = data;

    const startDay = periodo === 'Q1' ? 1 : 16;
    const endDay = periodo === 'Q1' ? 15 : new Date(selectedYear, selectedMonth + 1, 0).getDate();
    
    // Logo
        let logoBase64 = '';
    try {
        logoBase64 = await getBase64ImageFromUrl(LOGO_URL);
    } catch (e) {
        console.warn("No se pudo cargar el logo", e);
    }
    const pageWidth = pdf.internal.pageSize.width;

    const drawReceipt2 = (offsetY: number) => {
    try {
        if (logoBase64) pdf.addImage(logoBase64, 'JPEG', 15, offsetY + 10, 30, 15);
    } catch (e) {}


    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("RECIBO DE BONIFICACIÓN EXTRALEGAL", 200, offsetY + 20, { align: "right" });
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Período: ${startDay} al ${endDay} de ${meses[selectedMonth]} ${selectedYear}`, 200, offsetY + 26, { align: "right" });
    pdf.text(`Tasa Cambio Referencial: Bs. ${tasa.toFixed(2)} / USD`, 200, offsetY + 32, { align: "right" });

    // Datos del Trabajador
    pdf.setFillColor(240, 240, 245);
    pdf.rect(15, offsetY + 40, 180, 28, 'F');
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("DATOS DEL BENEFICIARIO", 20, offsetY + 45);
    pdf.setFont("helvetica", "normal");

    const filtroSucursalActivo = !!selectedBranchId;
    const empresaHeader = filtroSucursalActivo
      ? (emp.sucursales?.nombre_id || principalBranch?.nombre_id || 'FarmaNomina C.A.')
      : (principalBranch?.nombre_id || 'FarmaNomina C.A.');
    const rifHeader = filtroSucursalActivo
      ? (emp.sucursales?.rif || principalBranch?.rif || 'J-12345678-9')
      : (principalBranch?.rif || 'J-12345678-9');

    pdf.text(`Empresa: ${empresaHeader} - RIF: ${rifHeader}`, 20, offsetY + 50);

    if (!filtroSucursalActivo && emp.sucursales?.nombre_id) {
      pdf.setFontSize(9);
      pdf.text(`Sucursal: ${emp.sucursales.nombre_id} - RIF: ${emp.sucursales.rif || ''}`, 20, offsetY + 55);
      pdf.line(20, offsetY + 56, 195, offsetY + 56);
      pdf.setFontSize(10);
    }

    pdf.text(`Nombres y Apellidos: ${emp.nombre} ${emp.apellido}`, 20, offsetY + 58);
    pdf.text(`Cédula de Identidad: V-${emp.cedula}`, 120, offsetY + 58);
    pdf.text(`Cargo: ${emp.cargo || 'No especificado'}`, 20, offsetY + 64);
    
    // Cabecera de la tabla
    let y = offsetY + 75;
    pdf.setFillColor(220, 220, 220);
    pdf.rect(15, y, 180, 8, 'F');
    pdf.setFont("helvetica", "bold");
    pdf.text("CONCEPTO", 20, y + 5);
    pdf.text("DETALLE", 100, y + 5);
    pdf.text("MONTO (USD)", 140, y + 5);
    pdf.text("MONTO (Bs)", 170, y + 5);

    y += 15;
    pdf.setFont("helvetica", "normal");

    const addRow = (concepto: string, detalle: string, usd: number | null, bs: number | null) => {
        pdf.text(concepto, 20, y);
        pdf.text(detalle, 100, y);
        if (usd !== null && usd !== 0) pdf.text(`$ ${usd.toLocaleString('en-US', {minimumFractionDigits: 2})}`, 140, y);
        if (bs !== null && bs !== 0) pdf.text(`Bs. ${bs.toLocaleString('es-VE', {minimumFractionDigits: 2})}`, 170, y);
        y += 6;
    };

    if (bonoUsd > 0 || bonoBs > 0) addRow("Bono de Reparto (Prorrateo)", `${totalHrs.toFixed(2)} de ${horasBaseQuincena} hrs.`, bonoUsd, bonoBs);
    if (customAssignUsd > 0) addRow("Asignaciones Adicionales", extraAssignName || "Primas Extra", customAssignUsd, customAssignUsd * tasa);
    if (customDeductUsd > 0) addRow("Deducciones / Vales", "Retención Manual", -customDeductUsd, -(customDeductUsd * tasa));

    y += 5;
    pdf.line(15, y, 195, y);
    y += 10;

    // Totales
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("TOTAL NETO A PAGAR:", 80, y);
    pdf.setTextColor(0, 100, 0); // Verde
    pdf.text(`$ ${totalNetoUsd.toLocaleString('en-US', {minimumFractionDigits: 2})}`, 140, y);
    pdf.text(`Bs. ${totalNetoBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}`, 170, y);
    pdf.setTextColor(0, 0, 0); // Reset a negro

    // Firmas
    y += 15;

    pdf.line(20, y, 90, y);
    pdf.setFontSize(10);
    pdf.text("Firma Conforme Trabajador", 35, y + 5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Certifico haber recibido el pago exacto detallado en este comprobante.", 20, y + 10);

    pdf.line(120, y, 190, y);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("Firma y Sello Empleador", 135, y + 5);

        };

    drawReceipt2(0);
    // Línea de corte
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(5, 177, pageWidth - 5, 177);
    pdf.setLineDashPattern([], 0);
    pdf.setFontSize(6);
    pdf.text("-------------------------------------- Corte por aquí --------------------------------------", pageWidth / 2, 177, { align: "center" });

    drawReceipt2(178);

    if (!isGlobal) {
        window.open(URL.createObjectURL(pdf.output("blob")), "_blank");
    }
  };

  const generateGlobalReceipt2PDF = async (empDataList: any[]) => {
    if (!config || empDataList.length === 0) return;
    const doc = new jsPDF({ format: 'legal' });
    let isFirstPage = true;

    for (const data of empDataList) {
        if (!isFirstPage) {
            doc.addPage();
        }
        await generateReceipt2PDF(data, doc);
        isFirstPage = false;
    }

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

    const saveProrrateoConfig = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const configData = {
          montoIndicador,
          porcentajeRepartir,
          extraAssigns,
          extraAssignsData,
          extraDeductions,
          excludedEmployees,
          globalBonoBs,
          globalBonoUsd,
          globalBonoPerc
      };

      const { error } = await supabase
        .from('configuracion_global')
        .update({
            prorrateo_config: configData
        })
        .eq('id', config?.id);

      if (error) throw error;
      alert('Configuración de prorrateo guardada correctamente');
    } catch (err) {
      console.error(err);
      alert('Error al guardar configuración');
    }
  };

  const generateGlobalPDF = async () => {
    if (!config) return;
    const doc = new jsPDF({ format: 'legal' });
    let isFirstPage = true;
    const adelantosAplicadosGlobal: Array<{ id: string; tipo: 'adelanto_nomina' | 'prestamo_credito'; deducted: number; newSaldo: number }> = [];

    const filteredEmps = employees.filter(emp => (selectedBranchId ? emp.sucursal_id === selectedBranchId : true) && !excludedEmployees[emp.id]);

    for (const emp of filteredEmps) {
        if (!isFirstPage) {
            doc.addPage();
        }

        const breakdown = getPayrollBreakdown(emp);
        if (!breakdown) continue;
        await generatePDF(emp, breakdown, doc);
        adelantosAplicadosGlobal.push(...breakdown.adelantosAplicados);
        isFirstPage = false;
    }

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

  const generateReciboGeneralPDF = async () => {
    if (!config) return;

    const doc = new jsPDF({ format: 'legal' });
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const marginLeft = 15;
    const marginRight = pageWidth - 15;
    const bottomMargin = pageHeight - 18;

    const startDay = periodo === 'Q1' ? 1 : 16;
    const endDay = periodo === 'Q1' ? 15 : new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const fechaDesde = `${startDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;
    const fechaHasta = `${endDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;
    const fechaEmision = new Date().toLocaleString('es-VE');

    // --- Header (primera página) ---
    try { doc.addImage(LOGO_URL, 'JPEG', marginLeft, 12, 25, 15); } catch (e) {}

    doc.setFont("courier", "bold");
    doc.setFontSize(13);
    doc.text("RECIBO GENERAL DE PAGO DE NÓMINA", pageWidth / 2, 22, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("courier", "normal");
    doc.text(`Emisión: ${fechaEmision}`, marginRight, 12, { align: "right" });

    let y = 40;
    doc.setFontSize(9);
    doc.text(`EMPRESA: ${principalBranch?.nombre_id || 'FarmaNomina C.A.'}`, marginLeft, y);
    doc.text(`RIF: ${principalBranch?.rif || 'J-12345678-9'}`, marginRight, y, { align: "right" });
    y += 5;
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, marginRight, y, { align: "right" });
    y += 7;

    const drawColumnHeaders = () => {
      doc.setFont("courier", "bold");
      doc.setFontSize(9);
      doc.text("CONCEPTO", marginLeft, y);
      doc.text("CANT", 110, y, { align: "right" });
      doc.text("ASIGNACIONES", 150, y, { align: "right" });
      doc.text("DEDUCCIONES", 195, y, { align: "right" });
      y += 4;
      doc.line(marginLeft, y, marginRight, y);
      y += 4;
    };

    drawColumnHeaders();

    const cleanAmount = (value: number | null | undefined) => {
      if (value === null || value === undefined) return 0;
      return Math.abs(value) < 0.005 ? 0 : Number(value.toFixed(2));
    };

    const formatQty = (value: number | string, unit = '') => {
      if (typeof value === 'string') return value;
      const cleanValue = cleanAmount(value);
      if (cleanValue === 0) return '';
      const text = Number.isInteger(cleanValue)
        ? cleanValue.toString()
        : cleanValue.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      return unit ? `${text} ${unit}` : text;
    };

    let grandTotalAsign = 0;
    let grandTotalDeduc = 0;
    let grandTotalNeto = 0;

    const filteredEmps = employees.filter(emp => (selectedBranchId ? emp.sucursal_id === selectedBranchId : true) && !excludedEmployees[emp.id]);

    for (const emp of filteredEmps) {
      const breakdown = getPayrollBreakdown(emp);
      if (!breakdown) continue;

      const {
        calc, effectiveConfig,
        cLaborados, cDescanso, cDescansoLab, cDomLab, cExtDiur, cFerLab,
        cBonoNoc, cTurnos, cBonoMix, cExtNoc, cCompens, cSabLab, cCesta, cOtras,
        cIvss, cSpf, cFaov, cIslr, cVales, cAdelantoNomina, cPrestamo, neto,
        totalAsignaciones, totalDeducciones
      } = breakdown;

      grandTotalAsign += totalAsignaciones;
      grandTotalDeduc += totalDeducciones;
      grandTotalNeto += neto;

      // Estimar si cabe en la página actual (mínimo necesario: cabecera empleado + 3 filas + total + separador)
      if (y > bottomMargin - 45) {
        doc.addPage();
        y = 15;
        drawColumnHeaders();
      }

      // Sub-cabecera del empleado
      doc.setFont("courier", "bold");
      doc.setFontSize(9);
      doc.text(`TRABAJADOR: ${emp.nombre} ${emp.apellido}`, marginLeft, y);
      doc.text(`C.I.: ${emp.cedula}`, marginRight, y, { align: "right" });
      y += 4;
      doc.setFont("courier", "normal");
      doc.text(`Cargo: ${emp.cargo || 'General'}`, marginLeft, y);
      doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, marginRight, y, { align: "right" });
      y += 4;
      doc.text(`Salario Base Mensual (Bs): ${Number(calc.sueldo_base_mensual).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, marginLeft, y);
      y += 5;

      const addRow = (
        concepto: string,
        cant: number | string,
        asignacion: number | null,
        deduccion: number | null,
        hideIfZero: boolean = true
      ) => {
        const safeAsignacion = cleanAmount(asignacion);
        const safeDeduccion = cleanAmount(deduccion);
        const safeCant = typeof cant === 'number' ? cleanAmount(cant) : cant;
        if (hideIfZero && safeAsignacion === 0 && safeDeduccion === 0 && (safeCant === 0 || safeCant === '')) return;

        if (y > bottomMargin - 12) {
          doc.addPage();
          y = 15;
          drawColumnHeaders();
        }

        doc.setFont("courier", "normal");
        doc.setFontSize(9);
        doc.text(concepto.substring(0, 45), marginLeft, y);
        if (safeCant !== '') doc.text(`${safeCant}`, 110, y, { align: "right" });
        if (safeAsignacion > 0) doc.text(safeAsignacion.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 150, y, { align: "right" });
        if (safeDeduccion > 0) doc.text(safeDeduccion.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 195, y, { align: "right" });
        y += 4;
      };

      // Helper: la columna CANT muestra siempre el monto en Bs (sin "dias"/"turnos")
      // para que el recibo general quede uniforme con las filas de horas/bonos.
      const fmtBs = (v: number) => v > 0 ? v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

      if (effectiveConfig.diasLaborados?.enabled) addRow(`Dias laborados (${cLaborados.qty})`, fmtBs(cLaborados.total), cLaborados.total, null);
      if (effectiveConfig.diasDescanso?.enabled) addRow(`Dias de descanso (${cDescanso.qty})`, fmtBs(cDescanso.total), cDescanso.total, null);
      if (effectiveConfig.descansoLaborado?.enabled) addRow("Descanso laborado", fmtBs(cDescansoLab.total), cDescansoLab.total, null);
      if (effectiveConfig.domingoLaborado?.enabled) addRow("Domingo laborado", fmtBs(cDomLab.total), cDomLab.total, null);
      if (effectiveConfig.horasExtrasDiurnas?.enabled) addRow("Bono extra diurno", fmtBs(cExtDiur.total), cExtDiur.total, null);
      if (effectiveConfig.feriadosLaborados?.enabled) addRow("Feriado laborado", fmtBs(cFerLab.total), cFerLab.total, null);
      if (effectiveConfig.bonoNocturno?.enabled) addRow("Bono por Jornada Nocturna Art 117", fmtBs(cBonoNoc.total), cBonoNoc.total, null);
      if (effectiveConfig.turnosLaborados?.enabled) addRow("Turnos laborados", fmtBs(cTurnos.total), cTurnos.total, null);
      if (effectiveConfig.bonoJornadaMixta?.enabled) addRow("Bono jornada mixta", fmtBs(cBonoMix.total), cBonoMix.total, null);
      if (effectiveConfig.horasExtrasNocturnas?.enabled) addRow("Bono extra nocturno", fmtBs(cExtNoc.total), cExtNoc.total, null);
      if (effectiveConfig.diasCompensatorios?.enabled) addRow("Dias compensatorios", fmtBs(cCompens.total), cCompens.total, null);
      if (effectiveConfig.sabadoLaborado?.enabled) addRow("Sabado laborado", fmtBs(cSabLab.total), cSabLab.total, null);
      // Bono Alimentación (Cestaticket) se emite en recibo aparte.
      if (effectiveConfig.otrasAsignaciones?.enabled) addRow("Otras asignaciones", cOtras.qty > 0 ? formatQty(cOtras.qty) : "", cOtras.total, null);
      if (effectiveConfig.sso?.enabled) addRow("Seguro Social Obligatorio (S.S.O)", "4%", null, cIvss.total);
      if (effectiveConfig.rpe?.enabled) addRow("Regimen prestacional de empleo", "0.5%", null, cSpf.total);
      if (effectiveConfig.faov?.enabled) addRow("FAOV", "1%", null, cFaov.total);
      if (effectiveConfig.islr?.enabled) addRow("Retencion ISLR", cIslr.qty > 0 ? cIslr.qty + "%" : "", null, cIslr.total);
      if (effectiveConfig.vales?.enabled) addRow("Vales", "", null, cVales.total);
      if (effectiveConfig.adelantoNomina?.enabled && cAdelantoNomina.total > 0) addRow("Adelanto de nomina", "", null, cAdelantoNomina.total);
      if (effectiveConfig.prestamo?.enabled && cPrestamo.total > 0) addRow("Prestamo / credito", "", null, cPrestamo.total);

      // Total neto del empleado
      if (y > bottomMargin - 16) { doc.addPage(); y = 15; drawColumnHeaders(); }
      y += 2;
      doc.line(marginLeft, y, marginRight, y);
      y += 4;
      doc.setFont("courier", "bold");
      doc.setFontSize(9);
      doc.text("TOTAL NETO A RECIBIR (Bs.):", marginLeft, y);
      doc.text(neto.toLocaleString('es-VE', { minimumFractionDigits: 2 }), 150, y, { align: "right" });
      y += 6;

      // Dos líneas separadoras entre empleados
      doc.line(marginLeft, y, marginRight, y);
      y += 2;
      doc.line(marginLeft, y, marginRight, y);
      y += 8;
    }

    // Totales generales al final
    if (y > bottomMargin - 20) { doc.addPage(); y = 15; }
    y += 4;
    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL GENERAL DE ASIGNACIONES:", marginLeft, y);
    doc.text(grandTotalAsign.toLocaleString('es-VE', { minimumFractionDigits: 2 }), 150, y, { align: "right" });
    y += 6;
    doc.text("TOTAL GENERAL DE DEDUCCIONES:", marginLeft, y);
    doc.text(grandTotalDeduc.toLocaleString('es-VE', { minimumFractionDigits: 2 }), 195, y, { align: "right" });
    y += 6;
    doc.setFontSize(11);
    doc.text("TOTAL NETO GENERAL A PAGAR (Bs.):", marginLeft, y);
    doc.text(grandTotalNeto.toLocaleString('es-VE', { minimumFractionDigits: 2 }), 150, y, { align: "right" });

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

  const generateReciboGeneralProrrateoPDF = async (empDataList: any[]) => {
    if (!config || empDataList.length === 0) return;

    const doc = new jsPDF({ format: 'legal' });
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const marginLeft = 15;
    const marginRight = pageWidth - 15;
    const bottomMargin = pageHeight - 18;

    const startDay = periodo === 'Q1' ? 1 : 16;
    const endDay = periodo === 'Q1' ? 15 : new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const fechaDesde = `${startDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;
    const fechaHasta = `${endDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;
    const fechaEmision = new Date().toLocaleString('es-VE');
    const rawTasa = Number(empDataList[0]?.tasa ?? config?.tasa_bcv ?? 0);
    const tasa = Number.isFinite(rawTasa) && rawTasa > 0 ? rawTasa : 0.0001;

    // --- Header ---
    try { doc.addImage(LOGO_URL, 'JPEG', marginLeft, 12, 25, 15); } catch (e) {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("RECIBO GENERAL DE BONIFICACIÓN EXTRALEGAL", pageWidth / 2, 22, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Emisión: ${fechaEmision}`, marginRight, 12, { align: "right" });

    let y = 40;
    doc.setFontSize(9);
    doc.text(`EMPRESA: ${principalBranch?.nombre_id || 'FarmaNomina C.A.'}`, marginLeft, y);
    doc.text(`RIF: ${principalBranch?.rif || 'J-12345678-9'}`, marginRight, y, { align: "right" });
    y += 5;
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, marginRight, y, { align: "right" });
    y += 4;
    doc.text(`Tasa Cambio Referencial: Bs. ${Number(tasa).toFixed(2)} / USD`, marginLeft, y);
    y += 7;

    const drawColHeaders2 = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("CONCEPTO", marginLeft, y);
      doc.text("DETALLE", 95, y);
      doc.text("MONTO (USD)", 145, y, { align: "right" });
      doc.text("MONTO (Bs)", 195, y, { align: "right" });
      y += 4;
      doc.line(marginLeft, y, marginRight, y);
      y += 4;
    };

    drawColHeaders2();

    let grandTotalUsd = 0;
    let grandTotalBs = 0;

    for (const data of empDataList) {
      const { emp, totalHrs, bonoBs, bonoUsd, customAssignUsd, customDeductUsd, totalNetoUsd, totalNetoBs, horasBaseQuincena, extraAssignName } = data;

      grandTotalUsd += totalNetoUsd;
      grandTotalBs += totalNetoBs;

      if (y > bottomMargin - 45) {
        doc.addPage();
        y = 15;
        drawColHeaders2();
      }

      // Sub-cabecera del empleado
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`TRABAJADOR: ${emp.nombre} ${emp.apellido}`, marginLeft, y);
      doc.text(`C.I.: ${emp.cedula}`, marginRight, y, { align: "right" });
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.text(`Cargo: ${emp.cargo || 'General'}`, marginLeft, y);
      doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, marginRight, y, { align: "right" });
      y += 5;

      const addRow2 = (concepto: string, detalle: string, usd: number | null, bs: number | null) => {
        if (y > bottomMargin - 12) {
          doc.addPage();
          y = 15;
          drawColHeaders2();
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(concepto.substring(0, 50), marginLeft, y);
        doc.text(detalle, 95, y);
        if (usd !== null && usd !== 0) doc.text(`$ ${Math.abs(usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 145, y, { align: "right" });
        if (bs !== null && bs !== 0) doc.text(`Bs. ${Math.abs(bs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 195, y, { align: "right" });
        y += 4;
      };

      if (bonoUsd > 0 || bonoBs > 0) addRow2("Bono de Reparto (Prorrateo)", `${Number(totalHrs).toFixed(2)} de ${horasBaseQuincena} hrs.`, bonoUsd, bonoBs);
      if (customAssignUsd > 0) addRow2("Asignaciones Adicionales", extraAssignName || "Primas Extra", customAssignUsd, customAssignUsd * tasa);
      if (customDeductUsd > 0) addRow2("Deducciones / Vales", "Retención Manual", -customDeductUsd, -(customDeductUsd * tasa));

      // Total neto del empleado
      if (y > bottomMargin - 16) { doc.addPage(); y = 15; drawColHeaders2(); }
      y += 2;
      doc.line(marginLeft, y, marginRight, y);
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("TOTAL NETO A PAGAR:", marginLeft, y);
      doc.text(`$ ${totalNetoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 145, y, { align: "right" });
      doc.text(`Bs. ${totalNetoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 195, y, { align: "right" });
      y += 6;

      // Dos líneas separadoras entre empleados
      doc.line(marginLeft, y, marginRight, y);
      y += 2;
      doc.line(marginLeft, y, marginRight, y);
      y += 8;
    }

    // Totales generales al final
    if (y > bottomMargin - 20) { doc.addPage(); y = 15; }
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL GENERAL DE ASIGNACIONES (USD):", marginLeft, y);
    doc.text(`$ ${grandTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 145, y, { align: "right" });
    y += 6;
    doc.setFontSize(11);
    doc.text("TOTAL NETO GENERAL A PAGAR:", marginLeft, y);
    doc.text(`$ ${grandTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 145, y, { align: "right" });
    doc.text(`Bs. ${grandTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 195, y, { align: "right" });

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

  const generateGeneralPaymentLotttPDF = async () => {
    if (!config) return;

    const doc = new jsPDF({ format: 'legal', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.width;

    let logoBase64 = '';
    try { logoBase64 = await getBase64ImageFromUrl(LOGO_URL); } catch (e) {}

    if (logoBase64) {
      try { doc.addImage(logoBase64, 'JPEG', 15, 8, 28, 14); } catch (e) {}
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PLANILLA GENERAL DE PAGO - NÓMINA LOTTT", pageWidth / 2, 18, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const empresa = principalBranch?.nombre_id || 'FarmaNomina C.A.';
    const rif = principalBranch?.rif || 'J-12345678-9';
    doc.text(`Empresa: ${empresa}  |  RIF: ${rif}`, 15, 28);
    const startDay = periodo === 'Q1' ? 1 : 16;
    const endDay = periodo === 'Q1' ? 15 : new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const fechaDesde = `${startDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;
    const fechaHasta = `${endDay.toString().padStart(2, '0')}/${(selectedMonth + 1).toString().padStart(2, '0')}/${selectedYear}`;
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, pageWidth - 15, 28, { align: "right" });
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - 15, 34, { align: "right" });

    const filteredEmps = employees.filter(emp => (selectedBranchId ? emp.sucursal_id === selectedBranchId : true) && !excludedEmployees[emp.id]);
    const rows: any[] = [];
    let sumAsign = 0;
    let sumDeduc = 0;
    let sumNeto = 0;
    let n = 1;

    for (const emp of filteredEmps) {
      const snapshot = nominasCerradas.find(no => no.empleado_id === emp.id);
      const isClosed = !!snapshot;
      const breakdown = isClosed ? snapshot.detalles_calculo : getPayrollBreakdown(emp);
      if (!breakdown) continue;
      rows.push([
        n++,
        `${emp.nombre} ${emp.apellido}`,
        emp.cedula,
        emp.cargo || 'General',
        breakdown.totalAsignaciones.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        breakdown.totalDeducciones.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        breakdown.neto.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
      ]);
      sumAsign += breakdown.totalAsignaciones;
      sumDeduc += breakdown.totalDeducciones;
      sumNeto += breakdown.neto;
    }

    rows.push([
      '', 'TOTAL GENERAL', '', '',
      sumAsign.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
      sumDeduc.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
      sumNeto.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
    ]);

    (doc as any).autoTable({
      head: [['N°', 'Trabajador', 'C.I.', 'Cargo', 'Asignaciones (Bs)', 'Deducciones (Bs)', 'Neto a Pagar (Bs)']],
      body: rows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 45], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 251] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 45 },
        4: { cellWidth: 40, halign: 'right' },
        5: { cellWidth: 40, halign: 'right' },
        6: { cellWidth: 40, halign: 'right' },
      },
      didParseCell: (data: any) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [210, 240, 220];
        }
      },
      margin: { left: 15, right: 15 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.line(15, finalY, 110, finalY);
    doc.text("Firma y Sello Empleador", 45, finalY + 5);
    doc.line(pageWidth - 110, finalY, pageWidth - 15, finalY);
    doc.text("Vo.Bo. Contador / Administrador", pageWidth - 90, finalY + 5);

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

  const generateGeneralPaymentProrrateoPDF = async (empDataList: any[]) => {
    if (!config || empDataList.length === 0) return;

    const doc = new jsPDF({ format: 'legal', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.width;
    const rawTasa = Number(empDataList[0]?.tasa ?? config?.tasa_bcv ?? 0);
    const tasa = Number.isFinite(rawTasa) && rawTasa > 0 ? rawTasa : 0.0001;

    let logoBase64 = '';
    try { logoBase64 = await getBase64ImageFromUrl(LOGO_URL); } catch (e) {}

    if (logoBase64) {
      try { doc.addImage(logoBase64, 'JPEG', 15, 8, 28, 14); } catch (e) {}
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PLANILLA GENERAL DE PAGO - BONIFICACIÓN EXTRALEGAL", pageWidth / 2, 18, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const empresa = principalBranch?.nombre_id || 'FarmaNomina C.A.';
    const rif = principalBranch?.rif || 'J-12345678-9';
    doc.text(`Empresa: ${empresa}  |  RIF: ${rif}`, 15, 28);
    const startDay = periodo === 'Q1' ? 1 : 16;
    const endDay = periodo === 'Q1' ? 15 : new Date(selectedYear, selectedMonth + 1, 0).getDate();
    doc.text(`Período: ${startDay} al ${endDay} de ${meses[selectedMonth]} ${selectedYear}`, pageWidth - 15, 28, { align: "right" });
    doc.text(`Tasa BCV: Bs. ${tasa.toFixed(2)} / USD  |  Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - 15, 34, { align: "right" });

    const rows: any[] = [];
    let sumBonoUsd = 0;
    let sumAsignUsd = 0;
    let sumDeducUsd = 0;
    let sumNetoUsd = 0;
    let sumNetoBs = 0;
    let n = 1;

    for (const data of empDataList) {
      const { emp, totalHrs, bonoUsd, customAssignUsd, customDeductUsd, totalNetoUsd: netoUsd, totalNetoBs: netoBs } = data;
      rows.push([
        n++,
        `${emp.nombre} ${emp.apellido}`,
        emp.cedula,
        emp.cargo || 'General',
        totalHrs.toFixed(2),
        `$ ${bonoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `$ ${customAssignUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `$ ${customDeductUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `$ ${netoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `Bs. ${netoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      ]);
      sumBonoUsd += bonoUsd;
      sumAsignUsd += customAssignUsd;
      sumDeducUsd += customDeductUsd;
      sumNetoUsd += netoUsd;
      sumNetoBs += netoBs;
    }

    rows.push([
      '', 'TOTAL GENERAL', '', '', '',
      `$ ${sumBonoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `$ ${sumAsignUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `$ ${sumDeducUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `$ ${sumNetoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `Bs. ${sumNetoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
    ]);

    (doc as any).autoTable({
      head: [['N°', 'Trabajador', 'C.I.', 'Cargo', 'Horas', 'Bono Prorrateo', 'Asign. Extra', 'Deducciones', 'Neto (USD)', 'Neto (Bs)']],
      body: rows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [63, 60, 130], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 251] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 52 },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 38 },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 26, halign: 'right' },
        7: { cellWidth: 26, halign: 'right' },
        8: { cellWidth: 30, halign: 'right' },
        9: { cellWidth: 34, halign: 'right' },
      },
      didParseCell: (data: any) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [220, 220, 250];
        }
      },
      margin: { left: 15, right: 15 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.line(15, finalY, 110, finalY);
    doc.text("Firma y Sello Empleador", 45, finalY + 5);
    doc.line(pageWidth - 110, finalY, pageWidth - 15, finalY);
    doc.text("Vo.Bo. Contador / Administrador", pageWidth - 90, finalY + 5);

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

  const handleCerrarQuincena = async () => {
    if (!config) return;

    if (nominasCerradas.length > 0) {
      alert('Esta quincena ya se encuentra cerrada.');
      return;
    }
    
    if (!window.confirm(`¿Está seguro de cerrar la quincena (${periodo} de ${meses[selectedMonth]} ${selectedYear})? Esto guardará un registro histórico inmutable y descontará automáticamente las cuotas de los préstamos.`)) {
      return;
    }

    const adelantosAplicadosGlobal: Array<{ id: string; tipo: 'adelanto_nomina' | 'prestamo_credito'; deducted: number; newSaldo: number }> = [];
    const nominasToSave: any[] = [];

    for (const emp of employees) {
        const breakdown = getPayrollBreakdown(emp);
        if (!breakdown) continue;
        
        adelantosAplicadosGlobal.push(...breakdown.adelantosAplicados);
        
        nominasToSave.push({
          empleado_id: emp.id,
          mes: selectedMonth + 1,
          anio: selectedYear,
          quincena: periodo,
          dias_trabajados: breakdown.hoursData.diasTrabajados || 15,
          tasa_aplicada: config.tasa_bcv,
          sueldo_base_vef: breakdown.montoHorasNormales,
          bono_alimentacion_vef: breakdown.montoCestaticket,
          deduccion_ivss: breakdown.deduccionIvss,
          deduccion_faov: breakdown.deduccionFaov,
          deduccion_spf: breakdown.deduccionSpf,
          total_asignaciones_vef: breakdown.totalAsignaciones,
          total_deducciones_vef: breakdown.totalDeducciones,
          neto_pagar_vef: breakdown.neto,
          pagado: true,
          detalles_calculo: breakdown
        });
    }

    try {
      // 1. Guardar Histórico
      const { error: nomError } = await supabase.from('nominas_mensuales').insert(nominasToSave);
      if (nomError) throw nomError;

      // 2. Descontar Préstamos
      if (adelantosAplicadosGlobal.length > 0) {
        await persistAdelantosApplied(adelantosAplicadosGlobal);
      }

      await loadData();
      alert('Quincena cerrada exitosamente. Los registros históricos han sido guardados.');
    } catch (error: any) {
      console.error(error);
      alert(`Hubo un error al cerrar la quincena: ${error.message}`);
    }
  };

  const handleReabrirQuincena = async () => {
    if (!window.confirm(`¿Está seguro de REABRIR la quincena? Esto eliminará el registro histórico de este periodo. Nota: Los saldos de préstamos ya descontados NO se revertirán automáticamente.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('nominas_mensuales')
        .delete()
        .eq('mes', selectedMonth + 1)
        .eq('anio', selectedYear)
        .eq('quincena', periodo);

      if (error) throw error;
      await loadData();
      alert('Quincena reabierta. Ahora puede realizar ajustes nuevamente.');
    } catch (error: any) {
      console.error(error);
      alert('Error al reabrir la quincena.');
    }
  };

  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const loanDetailEmployee = loanDetailEmployeeId ? employees.find((e) => e.id === loanDetailEmployeeId) : null;
  const loanDetailItems = loanDetailEmployeeId ? getPrestamosDetalleByEmployee(loanDetailEmployeeId) : [];

  const detailEmployee = selectedDetailEmployeeId ? employees.find(e => e.id === selectedDetailEmployeeId) : null;
  const detailSnapshot = selectedDetailEmployeeId ? nominasCerradas.find(n => n.empleado_id === selectedDetailEmployeeId) : null;
  const isDetailClosed = !!detailSnapshot;
  const detailBreakdown = selectedDetailEmployeeId ? (isDetailClosed ? detailSnapshot.detalles_calculo : getPayrollBreakdown(detailEmployee!)) : null;

  const renderDetailModal = () => {
    if (!selectedDetailEmployeeId || !detailEmployee) return null;
    const isClosed = !!detailSnapshot;
    const br = isClosed ? detailSnapshot.detalles_calculo : getPayrollBreakdown(detailEmployee);
    if (!br) return null;
    const employeeAttendances = attendances.filter((att) => att.empleado_id === detailEmployee.id);
    const presentAttendances = employeeAttendances.filter((att) => att.estado === 'presente' && att.hora_entrada && att.hora_salida);
    const attendanceBreakdowns = presentAttendances.map((att) => ({
      attendance: att,
      shift: calculateDetailedShift(att.hora_entrada!, att.hora_salida!, att.fecha),
    }));
    const absenceCount = employeeAttendances.filter((att) => att.estado === 'falta').length;
    const restCount = employeeAttendances.filter((att) => att.estado === 'reposo').length;
    const vacationCount = employeeAttendances.filter((att) => att.estado === 'vacaciones').length;
    const weekendWorkedCount = attendanceBreakdowns.filter(({ shift }) => shift.descanso > 0).length;
    const mixedShiftCount = attendanceBreakdowns.filter(({ shift }) => shift.shiftType === 'Mixta').length;
    const nocturnalShiftCount = attendanceBreakdowns.filter(({ shift }) => shift.shiftType === 'Nocturna').length;
    const totalWorkedHours =
      br.hoursData.totalNormal +
      br.hoursData.totalExtraDiurna +
      br.hoursData.totalExtraNocturna +
      br.hoursData.totalDescanso;
    const attendanceCards = [
      {
        label: 'Dias con asistencia',
        value: br.hoursData.diasTrabajados.toString(),
        tone: 'emerald',
        description: 'Cantidad de dias con marcacion valida en el periodo actual.',
      },
      {
        label: 'Horas laboradas',
        value: `${totalWorkedHours.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`,
        tone: 'sky',
        description: 'Suma de horas normales, extras y horas trabajadas en descanso o fin de semana.',
      },
      {
        label: 'Horas nocturnas',
        value: `${br.hoursData.totalNightHours.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`,
        tone: 'indigo',
        description: 'Horas que generan recargo nocturno o forman parte de jornada mixta/nocturna.',
      },
      {
        label: 'Horas extra',
        value: `${(br.hoursData.totalExtraDiurna + br.hoursData.totalExtraNocturna).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`,
        tone: 'amber',
        description: 'Total de horas extraordinarias reconocidas por el sistema en el periodo.',
      },
      {
        label: 'Descansos trabajados',
        value: weekendWorkedCount.toString(),
        tone: 'violet',
        description: 'Cantidad de asistencias registradas en sabados o domingos.',
      },
      {
        label: 'Turnos mixtos / nocturnos',
        value: `${mixedShiftCount} / ${nocturnalShiftCount}`,
        tone: 'slate',
        description: 'Numero de jornadas mixtas y nocturnas detectadas a partir de las horas marcadas.',
      },
      {
        label: 'Incidencias',
        value: `${absenceCount}F / ${restCount}R / ${vacationCount}V`,
        tone: 'rose',
        description: 'Resumen de faltas, reposos y vacaciones registradas en la quincena.',
      },
      {
        label: 'Base del calculo',
        value: br.usaCalculoAsistencia ? 'Asistencia real' : 'Base manual',
        tone: br.usaCalculoAsistencia ? 'emerald' : 'amber',
        description: br.usaCalculoAsistencia
          ? 'La nomina toma dias y horas desde las asistencias del empleado.'
          : 'No hubo asistencias suficientes y el sistema esta usando valores base configurados.',
      },
    ] as const;
    const toneClasses: Record<string, string> = {
      emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
      sky: 'bg-sky-50 border-sky-100 text-sky-700',
      indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
      amber: 'bg-amber-50 border-amber-100 text-amber-700',
      violet: 'bg-violet-50 border-violet-100 text-violet-700',
      slate: 'bg-slate-50 border-slate-100 text-slate-700',
      rose: 'bg-rose-50 border-rose-100 text-rose-700',
    };

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 md:p-10 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-6xl max-h-full rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
          
          {/* Header del Modal */}
          <div className="p-8 md:p-10 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent"></div>
             <div className="relative z-10 flex items-center gap-6">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500 flex items-center justify-center text-3xl font-black shadow-lg shadow-emerald-500/20">
                   {detailEmployee.nombre[0]}{detailEmployee.apellido[0]}
                </div>
                <div>
                   <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-black tracking-tight">{detailEmployee.nombre} {detailEmployee.apellido}</h2>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isClosed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                         {isClosed ? 'Nómina Cerrada' : 'Simulación Activa'}
                      </span>
                   </div>
                   <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
                     {detailEmployee.cargo || 'Personal General'} • {detailEmployee.sucursales?.nombre_id || 'Principal'} • C.I. {detailEmployee.cedula}
                   </p>
                </div>
             </div>
             <button onClick={() => setSelectedDetailEmployeeId(null)} className="relative z-10 w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors">
                <span className="text-2xl">✕</span>
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-10">
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div title="Monto neto que recibira el empleado luego de deducciones y descuentos aplicados." className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100 flex flex-col justify-between">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Neto a Recibir</span>
                  <span className="text-4xl font-black text-emerald-700 tracking-tight mt-4">Bs. {br.neto.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                  <div className="mt-4 flex items-center gap-2">
                     <span className="text-[10px] font-bold text-emerald-500 uppercase">Tasa BCV: {isClosed ? detailSnapshot.tasa_aplicada : config?.tasa_bcv}</span>
                  </div>
               </div>
               <div title="Suma de todos los conceptos asignados en el recibo antes de deducciones." className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Asignaciones</span>
                  <span className="text-3xl font-black text-slate-800 tracking-tight block mt-4">+ Bs. {br.totalAsignaciones.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Incluye Cestaticket y Extras</p>
               </div>
               <div title="Total descontado por retenciones legales, adelantos, prestamos u otras deducciones." className="bg-rose-50 p-8 rounded-[2rem] border border-rose-100">
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Total Deducciones</span>
                  <span className="text-3xl font-black text-rose-600 tracking-tight block mt-4">- Bs. {br.totalDeducciones.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                  <p className="text-[10px] font-bold text-rose-400 mt-2 uppercase">Legales y Préstamos</p>
               </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Resumen de Asistencia</h3>
                <span className="text-[10px] font-black text-slate-400 uppercase">Datos del periodo visible</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {attendanceCards.map((card) => (
                  <div
                    key={card.label}
                    title={card.description}
                    className={`rounded-[1.75rem] border p-5 transition-transform hover:-translate-y-0.5 ${toneClasses[card.tone]}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{card.label}</p>
                    <p className="mt-3 text-2xl font-black tracking-tight">{card.value}</p>
                    <p className="mt-2 text-[11px] leading-relaxed opacity-80">{card.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
               {/* Columna Izquierda: Ingresos */}
               <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                     <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Detalle de Ingresos (Asignaciones)</h3>
                     <span className="text-[10px] font-black text-emerald-500">LOTTT Art. 104</span>
                  </div>
                  <div className="space-y-4">
                     <div title="Pago base del periodo. Si hay asistencias validas, usa los dias realmente trabajados; si no, usa la base configurada." className="flex justify-between items-center p-4 bg-slate-50/50 rounded-2xl">
                        <div>
                           <p className="font-bold text-slate-700 text-sm">Sueldo Base Quincenal</p>
                           <p className="text-[10px] text-slate-400 font-medium">Calculado sobre {br.hoursData.diasTrabajados || 15} días laborados</p>
                        </div>
                        <span className="font-black text-slate-800">Bs. {br.montoHorasNormales.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                     </div>
                     {br.montoCestaticket > 0 && (
                       <div className="flex justify-between items-center p-4 bg-slate-50/50 rounded-2xl border-l-4 border-emerald-400">
                          <div>
                             <p className="font-bold text-slate-700 text-sm">Cestaticket Socialista</p>
                             <p className="text-[10px] text-slate-400 font-medium tracking-tight">Indexado al tipo de cambio (Art. 131)</p>
                          </div>
                          <span className="font-black text-emerald-600">Bs. {br.montoCestaticket.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                       </div>
                     )}
                     {(br.montoExtrasDiurnas > 0 || br.montoExtrasNocturnas > 0) && (
                       <div title="Desglose de horas extraordinarias diurnas y nocturnas detectadas por las marcaciones del periodo." className="p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100">
                          <p className="font-bold text-emerald-700 text-xs mb-3 uppercase tracking-wider">Horas Extraordinarias (Art. 178)</p>
                          <div className="space-y-2">
                             {br.montoExtrasDiurnas > 0 && (
                               <div className="flex justify-between text-sm">
                                  <span className="text-slate-500 font-medium">Diurnas ({br.hoursData.totalExtraDiurna.toFixed(1)}h)</span>
                                  <span className="font-bold text-slate-700">Bs. {br.montoExtrasDiurnas.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                               </div>
                             )}
                             {br.montoExtrasNocturnas > 0 && (
                               <div className="flex justify-between text-sm">
                                  <span className="text-slate-500 font-medium">Nocturnas ({br.hoursData.totalExtraNocturna.toFixed(1)}h)</span>
                                  <span className="font-bold text-slate-700">Bs. {br.montoExtrasNocturnas.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                               </div>
                             )}
                          </div>
                       </div>
                     )}
                     {br.montoBonoNocturno > 0 && (
                        <div title="Recargo legal aplicado por horas en jornada nocturna o por turnos con componente nocturno." className="flex justify-between items-center p-4 bg-indigo-50/30 rounded-2xl">
                           <div>
                              <p className="font-bold text-slate-700 text-sm">Bono por Jornada Nocturna (Art. 117)</p>
                              <p className="text-[10px] text-slate-400 font-medium">Recargo del 30% sobre {br.hoursData.totalNightHours.toFixed(1)} horas</p>
                           </div>
                           <span className="font-black text-indigo-600">Bs. {br.montoBonoNocturno.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                        </div>
                     )}
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div title="Horas ordinarias reconocidas dentro del limite legal de la jornada." className="p-4 bg-white border border-slate-200 rounded-2xl">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Horas normales</p>
                           <p className="font-black text-slate-800">{br.hoursData.totalNormal.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h</p>
                        </div>
                        <div title="Horas trabajadas en sabados o domingos, relevantes para descanso laborado y prorrateos." className="p-4 bg-white border border-slate-200 rounded-2xl">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Horas en descanso</p>
                           <p className="font-black text-slate-800">{br.hoursData.totalDescanso.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h</p>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Columna Derecha: Deducciones */}
               <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                     <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Deducciones Legales y Otros</h3>
                     <span className="text-[10px] font-black text-rose-500">Retenciones Obligatorias</span>
                  </div>
                  <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-2xl">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">IVSS (4%)</p>
                           <p className="font-black text-slate-800">Bs. {br.deduccionIvss.toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">FAOV (1%)</p>
                           <p className="font-black text-slate-800">Bs. {br.deduccionFaov.toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                        </div>
                     </div>
                     
                     {br.totalAdelantos > 0 && (
                        <div className="p-6 bg-rose-50/50 rounded-3xl border border-rose-100">
                           <div className="flex justify-between items-center mb-4">
                              <p className="font-black text-rose-600 text-xs uppercase tracking-widest">Descuento de Préstamos</p>
                              <span className="text-xs font-black text-rose-700">Bs. {br.totalAdelantos.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                           </div>
                           <div className="space-y-2">
                              {br.adelantosAplicados.map((item: any, idx: number) => (
                                 <div key={idx} className="flex justify-between text-xs font-medium text-slate-500">
                                    <span>{item.tipo === 'prestamo_credito' ? 'Cuota Préstamo' : 'Adelanto Nómina'}</span>
                                    <span>- Bs. {item.deducted.toLocaleString('es-VE')}</span>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                     
                     <div className="p-8 bg-slate-900 rounded-[2rem] text-white flex justify-between items-center shadow-xl shadow-slate-900/20">
                        <div>
                           <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Neto a Pagar</p>
                           <p className="text-2xl font-black mt-1">Bs. {br.neto.toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                             onClick={() => generatePDF(detailEmployee, br)}
                             className="bg-emerald-500 hover:bg-emerald-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                          >
                             Descargar Recibo
                          </button>
                          <button
                             onClick={() => generateCestaticketPDF(detailEmployee)}
                             className="bg-white/15 hover:bg-white/25 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-white/30"
                          >
                             🍽️ Recibo Cestaticket
                          </button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center">
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em]">Sistema Experto de Nómina • Gestión Administrativa Profesional</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6">
      
      {/* Modal Detalle Profesional */}
      {renderDetailModal()}
      
      {/* Modal Adelantos */}

      {/* Modal para Agregar Asignación Extra */}
      {showExtraAssignModal && selectedExtraAssignEmpId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="bg-emerald-600 p-6 flex justify-between items-center relative overflow-hidden">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
               <h3 className="text-white font-black text-lg relative z-10 flex items-center gap-2">
                 <span>✨</span> Asignación Extra
               </h3>
               <button
                 onClick={() => { setShowExtraAssignModal(false); setSelectedExtraAssignEmpId(null); }}
                 className="text-emerald-100 hover:text-white transition-colors relative z-10"
               >
                 ✕
               </button>
            </div>
            <div className="p-6 space-y-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre Asignación</label>
                  <input
                    type="text"
                    className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Ej. Bono Especial"
                    value={extraAssignsData[selectedExtraAssignEmpId]?.nombre || ''}
                    onChange={(e) => {
                       setExtraAssignsData(prev => ({
                           ...prev,
                           [selectedExtraAssignEmpId]: {
                               ...prev[selectedExtraAssignEmpId],
                               nombre: e.target.value,
                               montoUsd: extraAssigns[selectedExtraAssignEmpId] || 0
                           }
                       }))
                    }}
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Monto ($ USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">$</span>
                    <input
                      type="number"
                      className="w-full pl-8 p-3 border border-slate-200 rounded-xl font-black text-xl text-emerald-600 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="0.00"
                      value={extraAssigns[selectedExtraAssignEmpId] || ''}
                      onChange={(e) => {
                         const val = Number(e.target.value);
                         setExtraAssigns(prev => ({...prev, [selectedExtraAssignEmpId]: val}));
                         setExtraAssignsData(prev => ({
                           ...prev,
                           [selectedExtraAssignEmpId]: {
                             nombre: prev[selectedExtraAssignEmpId]?.nombre || '',
                             montoUsd: val
                           }
                         }));
                      }}
                    />
                  </div>
                  <div className="text-right mt-1 text-xs font-black text-slate-400">
                     ≈ Bs. {((extraAssigns[selectedExtraAssignEmpId] || 0) * (config?.tasa_bcv || 1)).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
               </div>
               <button
                 onClick={() => { setShowExtraAssignModal(false); setSelectedExtraAssignEmpId(null); }}
                 className="w-full mt-4 bg-emerald-600 text-white font-black py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/30"
               >
                 Guardar Asignación
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Listado Cestaticket para Firmas (preview + edición de USD por empleado) */}
      {showCestaListModal && config && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[160] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500 flex flex-col">
            <div className="bg-emerald-700 p-5 flex justify-between items-center">
              <h3 className="text-white font-black text-lg flex items-center gap-2">
                <span>🍽️</span> Listado Cestaticket — {meses[selectedMonth]} {selectedYear}
              </h3>
              <button onClick={() => setShowCestaListModal(false)} className="text-emerald-100 hover:text-white transition-colors">✕</button>
            </div>

            <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Sucursal</label>
                <div className="text-sm font-bold text-slate-800">
                  {selectedBranchId
                    ? (branches.find(b => b.id === selectedBranchId)?.nombre_id || '—')
                    : (principalBranch?.nombre_id || 'Todas')}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Fecha del listado</label>
                <input
                  type="date"
                  value={cestaListFecha}
                  onChange={e => setCestaListFecha(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tasa BCV</label>
                <div className="text-sm font-bold text-slate-800">{Number(config.tasa_bcv || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cestaticket base</label>
                <div className="text-sm font-bold text-slate-800">${Number(config.cestaticket_usd || 0).toFixed(2)} / mes</div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Cédula</th>
                    <th className="px-3 py-2 text-left">Nombre y Apellido</th>
                    <th className="px-3 py-2 text-center">Faltas</th>
                    <th className="px-3 py-2 text-right">USD</th>
                    <th className="px-3 py-2 text-right">Bs</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs font-semibold text-slate-800">
                  {getCestaListEmpleados().map(emp => {
                    const { faltas } = calcularCestaticketEmpleado(emp);
                    const usdStr = cestaListUsd[emp.id] ?? '0';
                    const usdNum = parseFloat(usdStr) || 0;
                    const bsNum = usdNum * (Number(config.tasa_bcv) || 0);
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">{emp.cedula}</td>
                        <td className="px-3 py-2">{emp.nombre} {emp.apellido}</td>
                        <td className="px-3 py-2 text-center">{faltas > 0 ? <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md font-black">{faltas}</span> : <span className="text-slate-400">0</span>}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-emerald-600 font-bold">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={usdStr}
                              onChange={e => setCestaListUsd(prev => ({ ...prev, [emp.id]: e.target.value }))}
                              className="w-24 px-2 py-1 border border-slate-300 rounded-md text-right font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-black text-emerald-700">
                          {bsNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-right font-black text-slate-600 uppercase text-[10px] tracking-widest">Total</td>
                    <td className="px-3 py-3 text-right font-black text-emerald-700">
                      ${getCestaListEmpleados().reduce((s, e) => s + (parseFloat(cestaListUsd[e.id] || '0') || 0), 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-emerald-700">
                      Bs. {(getCestaListEmpleados().reduce((s, e) => s + (parseFloat(cestaListUsd[e.id] || '0') || 0), 0) * (Number(config.tasa_bcv) || 0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-3 bg-white">
              <button
                onClick={() => setShowCestaListModal(false)}
                className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { generateCestaticketListadoPDF(); setShowCestaListModal(false); }}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/30"
              >
                📄 Generar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Agregar Deducción Extra */}
      {showExtraDeductModal && selectedExtraDeductEmpId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="bg-rose-600 p-6 flex justify-between items-center relative overflow-hidden">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
               <h3 className="text-white font-black text-lg relative z-10 flex items-center gap-2">
                 <span>📉</span> Deducción Extra
               </h3>
               <button
                 onClick={() => { setShowExtraDeductModal(false); setSelectedExtraDeductEmpId(null); }}
                 className="text-rose-100 hover:text-white transition-colors relative z-10"
               >
                 ✕
               </button>
            </div>
            <div className="p-6 space-y-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Monto ($ USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500 font-bold">$</span>
                    <input
                      type="number"
                      className="w-full pl-8 p-3 border border-slate-200 rounded-xl font-black text-xl text-rose-600 focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                      placeholder="0.00"
                      value={extraDeductions[selectedExtraDeductEmpId] || ''}
                      onChange={(e) => {
                         const val = Number(e.target.value);
                         setExtraDeductions(prev => ({...prev, [selectedExtraDeductEmpId]: val}));
                      }}
                    />
                  </div>
                  <div className="text-right mt-1 text-xs font-black text-slate-400">
                     ≈ Bs. {((extraDeductions[selectedExtraDeductEmpId] || 0) * (config?.tasa_bcv || 1)).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
               </div>
               <button
                 onClick={() => { setShowExtraDeductModal(false); setSelectedExtraDeductEmpId(null); }}
                 className="w-full mt-4 bg-rose-600 text-white font-black py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-500/30"
               >
                 Guardar Deducción
               </button>
            </div>
          </div>
        </div>
      )}

      {showAdelantoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] animate-in fade-in duration-200">
            <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
                <h3 className="text-xl font-black text-slate-800 mb-4">{editingAdelantoId ? 'Editar' : 'Registrar'} Adelanto / Préstamo</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                        <select
                          className="w-full p-3 border rounded-xl font-semibold"
                          value={adelantoTipo}
                          onChange={e => setAdelantoTipo(e.target.value as Adelanto['tipo'])}
                        >
                          <option value="adelanto_nomina">Adelanto de Nómina</option>
                          <option value="prestamo_credito">Préstamo / Crédito</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto (Bs.)</label>
                        <input type="number" className="w-full p-3 border rounded-xl font-bold text-lg" value={adelantoMonto} onChange={e => setAdelantoMonto(e.target.value)} autoFocus />
                    </div>
                    {adelantoTipo === 'prestamo_credito' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cuota Quincenal (Bs.)</label>
                        <input
                          type="number"
                          className="w-full p-3 border rounded-xl font-bold text-lg"
                          value={adelantoCuota}
                          onChange={e => setAdelantoCuota(e.target.value)}
                        />
                      </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo</label>
                        <input
                          type="text"
                          className="w-full p-3 border rounded-xl"
                          value={adelantoMotivo}
                          onChange={e => setAdelantoMotivo(e.target.value)}
                          placeholder={adelantoTipo === 'prestamo_credito' ? 'Ej: Préstamo escolar' : 'Ej: Emergencia médica'}
                        />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => {
                            setShowAdelantoModal(false);
                            setAdelantoMonto('');
                            setAdelantoTipo('adelanto_nomina');
                            setAdelantoCuota('');
                            setAdelantoMotivo('');
                          }}
                          className="flex-1 py-3 text-slate-500 font-bold bg-slate-100 rounded-xl hover:bg-slate-200"
                        >
                          Cancelar
                        </button>
                        <button onClick={handleCreateAdelanto} className="flex-1 py-3 text-white font-bold bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/20">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Modal Detalle de Préstamos */}
      {loanDetailEmployeeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-4xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-800">Detalle de Préstamos / Créditos</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  {loanDetailEmployee ? `${loanDetailEmployee.nombre} ${loanDetailEmployee.apellido}` : 'Empleado'}
                </p>
              </div>
              <button
                onClick={() => setLoanDetailEmployeeId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {loanDetailItems.length === 0 ? (
              <div className="py-12 text-center text-sm font-semibold text-slate-400">
                No hay préstamos/créditos registrados para este empleado.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Tipo / Motivo</th>
                      <th className="px-4 py-3 text-right">Monto Original</th>
                      <th className="px-4 py-3 text-right">Cuota / Cobro</th>
                      <th className="px-4 py-3 text-right">Saldo Pendiente</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loanDetailItems.map((item) => {
                      const isLoan = item.tipo === 'prestamo_credito';
                      const saldo = Math.max(0, toNumber(item.saldo_pendiente ?? item.monto, 0));
                      const cuota = Math.max(0, toNumber(item.cuota_quincenal ?? item.monto, 0));
                      const monto = Math.max(0, toNumber(item.monto, 0));
                      const fecha = item.fecha_solicitud
                        ? new Date(`${item.fecha_solicitud}T00:00:00`).toLocaleDateString('es-VE')
                        : '-';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-700">{fecha}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${isLoan ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                              {isLoan ? 'Préstamo' : 'Adelanto'}
                            </span>
                            <div className="text-xs text-slate-500 font-medium mt-1 truncate max-w-[150px]" title={item.motivo}>
                              {item.motivo || 'Sin motivo'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">Bs. {monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">
                            {isLoan ? `Bs. ${cuota.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : 'Cobro Único'}
                          </td>
                          <td className={`px-4 py-3 text-right font-black ${saldo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            Bs. {saldo.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${item.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {item.estado || 'aprobado'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingAdelantoId(item.id);
                                  setSelectedEmployeeId(item.empleado_id);
                                  setAdelantoTipo(item.tipo);
                                  setAdelantoMonto(item.monto.toString());
                                  setAdelantoCuota(item.cuota_quincenal?.toString() || '');
                                  setAdelantoMotivo(item.motivo || '');
                                  setShowAdelantoModal(true);
                                }}
                                className="p-1.5 hover:bg-slate-100 text-amber-500 rounded-lg transition-colors"
                                title="Editar"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteAdelanto(item.id)}
                                className="p-1.5 hover:bg-slate-100 text-rose-500 rounded-lg transition-colors"
                                title="Eliminar"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black text-slate-800 border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-right uppercase text-[10px] tracking-widest text-slate-500">Total</td>
                      <td className="px-4 py-3 text-right">Bs. {loanDetailItems.reduce((acc, curr) => acc + Math.max(0, toNumber(curr.monto, 0)), 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right">
                        Bs. {loanDetailItems.reduce((acc, curr) => acc + (curr.tipo === 'prestamo_credito' ? Math.max(0, toNumber(curr.cuota_quincenal ?? curr.monto, 0)) : Math.max(0, toNumber(curr.monto, 0))), 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-rose-600">Bs. {loanDetailItems.reduce((acc, curr) => acc + Math.max(0, toNumber(curr.saldo_pendiente ?? curr.monto, 0)), 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Configuración de Recibo */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-5xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-800">
                {receiptConfigEmployeeId ? `Configurar Recibo (${employees.find(e => e.id === receiptConfigEmployeeId)?.nombre} ${employees.find(e => e.id === receiptConfigEmployeeId)?.apellido})` : 'Configurar Recibo Global'}
              </h3>
              <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="overflow-x-auto">
               {(() => {
                 let activeBreakdown: any = null;
                 if (receiptConfigEmployeeId && config) {
                    const emp = employees.find(e => e.id === receiptConfigEmployeeId);
                    if (emp) {
                       activeBreakdown = getPayrollBreakdown(emp);
                    }
                 }
                 const baseD = 130 / 30;
                 const baseH = baseD / 8;
                 const globalDefaults: Record<string, number> = {
                    diasLaborados: baseD, diasDescanso: baseD, descansoLaborado: baseD * 1.5,
                    domingoLaborado: baseD * 1.5, horasExtrasDiurnas: baseH * 1.5, feriadosLaborados: baseD * 1.5,
                    bonoNocturno: baseH * 0.30, turnosLaborados: baseD, bonoJornadaMixta: baseH * 0.30,
                    horasExtrasNocturnas: baseH * 1.95, diasCompensatorios: baseD, sabadoLaborado: baseD,
                    bonoAlimentacion: config?.bono_alimentacion_vef || 1000, otrasAsignaciones: 0, vales: 0,
                    sso: 0, rpe: 0, faov: 0, islr: 0, adelantoNomina: 0, prestamo: 0
                 };
                 const getBMap = (br: any): Record<string, any> => ({
                    diasLaborados: br.cLaborados, diasDescanso: br.cDescanso, descansoLaborado: br.cDescansoLab,
                    domingoLaborado: br.cDomLab, horasExtrasDiurnas: br.cExtDiur, feriadosLaborados: br.cFerLab,
                    bonoNocturno: br.cBonoNoc, turnosLaborados: br.cTurnos, bonoJornadaMixta: br.cBonoMix,
                    horasExtrasNocturnas: br.cExtNoc, diasCompensatorios: br.cCompens, sabadoLaborado: br.cSabLab,
                    bonoAlimentacion: br.cCesta, otrasAsignaciones: br.cOtras, vales: br.cVales,
                    sso: br.cIvss, rpe: br.cSpf, faov: br.cFaov, islr: br.cIslr,
                    adelantoNomina: br.cAdelantoNomina, prestamo: br.cPrestamo
                 });
                 const bMap = activeBreakdown ? getBMap(activeBreakdown) : null;

                 return (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3 text-center">Incluir</th>
                    <th className="px-4 py-3 text-center">Cant.</th>
                    <th className="px-4 py-3 text-right">Monto Uni. (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs font-semibold text-slate-800">
                  {Object.entries({
                    diasLaborados: { label: "Días Laborados Art 184", unit: "días" },
                    diasDescanso: { label: "Días de descanso Art 119", unit: "días" },
                    descansoLaborado: { label: "Adicional por descanso lab Art 119-120", unit: "días" },
                    domingoLaborado: { label: "Adicional por domingo lab Art 119-120", unit: "días" },
                    horasExtrasDiurnas: { label: "Hora(s) Extras Diurnas", unit: "horas" },
                    feriadosLaborados: { label: "Adicional por feriados lab Art 119-120", unit: "días" },
                    bonoNocturno: { label: "Bono por Jornada Nocturna Art 117", unit: "horas" },
                    bonoJornadaMixta: { label: "Bono por Jornada Mixta Art 117/173-3", unit: "horas" },
                    horasExtrasNocturnas: { label: "Hora(s) Extras Nocturnas", unit: "horas" },
                    otrasAsignaciones: { label: "Otras Asignaciones", unit: "cant" },
                    vales: { label: "Vales", unit: "cant" },
                    sso: { label: "S.S.O", unit: "4%" },
                    rpe: { label: "R.P.E", unit: "0.5%" },
                    faov: { label: "FAOV", unit: "1%" },
                    islr: { label: "% de Retención ISLR", unit: "%" },
                    adelantoNomina: { label: "Adelanto de Nómina", unit: "fijo" },
                    prestamo: { label: "Préstamo / Crédito", unit: "fijo" }
                  }).map(([key, configItem]) => {
                    const item = (receiptConfig as any)[key] || { enabled: false, cantidad: 0, montoUnitario: 0 };
                    
                    let displayUnit = item.montoUnitario || 0;
                    if (bMap && bMap[key]) {
                        displayUnit = bMap[key].unit;
                    } else if (!activeBreakdown && item.montoUnitario === 0 && globalDefaults[key] !== undefined) {
                        displayUnit = globalDefaults[key];
                    }

                    const isQtyReadOnly = ['bonoAlimentacion', 'sso', 'rpe', 'faov', 'adelantoNomina', 'prestamo'].includes(key);

                    return (
                      <tr key={key} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">{configItem.label}</td>
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" checked={item.enabled} className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer" onChange={e => setReceiptConfig(prev => ({ ...prev, [key]: { ...item, enabled: e.target.checked } }))} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                             <input 
                               type="number" 
                               step="0.01" 
                               className={`w-16 p-1.5 border border-slate-300 rounded-lg text-center outline-none transition-all ${isQtyReadOnly ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-700'}`} 
                               value={item.cantidad === 0 && !isQtyReadOnly ? '' : (item.cantidad ?? '')} 
                               placeholder={isQtyReadOnly ? "-" : "0"} 
                               readOnly={isQtyReadOnly}
                               onChange={e => { 
                                 if (isQtyReadOnly) return;
                                 const val = e.target.value; 
                                 setReceiptConfig(prev => ({ ...prev, [key]: { ...item, cantidad: val === '' ? 0 : parseFloat(val) } })) 
                               }} 
                             />
                             <span className="text-[10px] text-slate-500 font-bold uppercase w-8 text-left">({configItem.unit})</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="text" className="w-24 p-1.5 border border-slate-200 rounded-lg text-right bg-slate-100/80 text-slate-500 cursor-not-allowed font-semibold shadow-inner" value={displayUnit.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} readOnly title="Cálculo automático por sistema" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                 );
               })()}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => {
                if (receiptConfigEmployeeId) {
                  const emp = employees.find(e => e.id === receiptConfigEmployeeId);
                  if (emp) { setReceiptConfig(buildAttendanceDrivenReceiptConfig(emp)); return; }
                }
                setReceiptConfig(defaultReceiptConfig);
              }} className="px-5 py-3 bg-slate-100 rounded-xl text-slate-700 font-bold">Restablecer</button>
              <button
                onClick={handleSaveReceiptConfig}
                disabled={savingReceiptConfig}
                className="px-5 py-3 bg-emerald-600 rounded-xl text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingReceiptConfig ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sm:gap-6 min-w-0">
        <div className="min-w-0 shrink-0">
           <h3 className="text-xl font-black text-slate-800 tracking-tight">Procesar Nómina</h3>
           <div className="flex bg-slate-100 p-1 rounded-lg mt-2 w-max">
             <button 
               onClick={() => setActiveTab('lottt')}
               className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${activeTab === 'lottt' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
             >
               Nómina LOTTT
             </button>
             <button 
               onClick={() => setActiveTab('prorrateo')}
               className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${activeTab === 'prorrateo' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
             >
               Recibo 2 (Prorrateo)
             </button>
           </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 items-center bg-slate-50 p-2 rounded-xl w-full xl:w-auto min-w-0">
           <select 
             className="bg-white border border-slate-200 p-2 rounded-lg text-sm font-bold min-w-[150px] outline-none focus:ring-2 focus:ring-emerald-500"
             value={selectedBranchId}
             onChange={e => setSelectedBranchId(e.target.value)}
           >
             <option value="">Todas las sucursales</option>
             {branches.map(b => (
               <option key={b.id} value={b.id}>{b.nombre_id}</option>
             ))}
           </select>
           <select className="bg-white border p-2 rounded-lg text-sm font-bold" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
             {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
           </select>
           <select className="bg-white border p-2 rounded-lg text-sm font-bold" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
             {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
           </select>
           
           <div className="flex bg-slate-200 p-1 rounded-lg">
             <button 
               onClick={() => setPeriodo('Q1')} 
               className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${periodo === 'Q1' ? 'bg-[#1E1E2D] text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
             >
               1ra Quincena
             </button>
             <button 
               onClick={() => setPeriodo('Q2')} 
               className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${periodo === 'Q2' ? 'bg-[#1E1E2D] text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
             >
               2da Quincena
             </button>
           </div>

           {/* Grupo: Generar documentos */}
           <div className="flex flex-col gap-1">
             <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Generar</span>
             <div className="flex flex-wrap gap-1.5">
               <button onClick={generateGlobalPDF} className="bg-slate-800 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-slate-700 transition-colors shadow-lg shadow-slate-800/20 flex items-center gap-1 whitespace-nowrap">
                 <span>📄</span> <span className="hidden sm:inline">Recibo</span> Global
               </button>
               <button onClick={generateCestaticketGlobalPDF} className="bg-emerald-600 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-1 whitespace-nowrap">
                 <span>🍽️</span> Cestaticket General
               </button>
               <button onClick={openCestaListModal} className="bg-emerald-700 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-800 transition-colors shadow-lg shadow-emerald-700/20 flex items-center gap-1 whitespace-nowrap">
                 <span>📝</span> Listado Cestaticket
               </button>
               <button onClick={generateReciboGeneralPDF} className="bg-indigo-700 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-800 transition-colors shadow-lg shadow-indigo-700/20 flex items-center gap-1 whitespace-nowrap">
                 <span>📑</span> <span className="hidden sm:inline">Recibo</span> General
               </button>
               <button onClick={generateGeneralPaymentLotttPDF} className="bg-emerald-800 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-800/20 flex items-center gap-1 whitespace-nowrap">
                 <span>📋</span> Planilla LOTTT
               </button>
             </div>
           </div>

           <div className="hidden xl:block w-px h-10 bg-slate-200 self-end mb-0.5"></div>

           {/* Grupo: Acciones */}
           <div className="flex flex-col gap-1">
             <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Acciones</span>
             <div className="flex flex-wrap gap-1.5">
               <button onClick={() => {
                 setReceiptConfigEmployeeId(null);
                 setReceiptConfig(config?.receipt_print_config ? normalizeReceiptPrintConfig(config.receipt_print_config) : defaultReceiptConfig);
                 setShowConfigModal(true);
               }} className="bg-white border border-slate-200 text-slate-700 px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-slate-100 transition-colors flex items-center gap-1 whitespace-nowrap">
                 <span>⚙️</span> Configurar
               </button>
               <button
                 onClick={handleResetAllReceiptConfigs}
                 disabled={resettingAllReceipts}
                 className="bg-amber-500 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20 flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
               >
                 <span>🔄</span> {resettingAllReceipts ? 'Restableciendo...' : 'Restablecer Recibos'}
               </button>
               {nominasCerradas.length > 0 ? (
                 <button onClick={handleReabrirQuincena} className="bg-rose-500 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20 flex items-center gap-1 whitespace-nowrap">
                   <span>🔓</span> Reabrir Quincena
                 </button>
               ) : (
                 <button onClick={handleCerrarQuincena} className="bg-emerald-500 text-white px-2 sm:px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-1 whitespace-nowrap">
                   <span>✅</span> Cerrar Quincena
                 </button>
               )}
             </div>
           </div>
        </div>
      </div>

      {activeTab === 'lottt' && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Buscar empleado por nombre o cédula..."
              value={employeeSearch}
              onChange={e => setEmployeeSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ordenar por</span>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value as typeof sortField)}
              className="bg-white border border-slate-200 px-2 py-2 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="nombre">Nombre</option>
              <option value="cedula">Cédula</option>
              <option value="asignaciones">Asignaciones</option>
              <option value="deducciones">Deducciones</option>
              <option value="neto">Neto a Pagar</option>
            </select>
            <button
              onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
              className="bg-white border border-slate-200 px-2 py-2 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors"
              title={sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
            >
              {sortDirection === 'asc' ? '↑ A-Z' : '↓ Z-A'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[800px]">
          <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b">
            <tr>
              <th className="px-3 py-4 text-center w-10">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  title="Seleccionar/Deseleccionar todos"
                  checked={(() => {
                    const filtered = employees.filter(emp => selectedBranchId ? emp.sucursal_id === selectedBranchId : true);
                    return filtered.length > 0 && filtered.every(emp => !excludedEmployees[emp.id]);
                  })()}
                  onChange={(e) => {
                    const filtered = employees.filter(emp => selectedBranchId ? emp.sucursal_id === selectedBranchId : true);
                    const newExcluded = { ...excludedEmployees };
                    filtered.forEach(emp => { newExcluded[emp.id] = !e.target.checked; });
                    setExcludedEmployees(newExcluded);
                  }}
                />
              </th>
              <th className="px-6 py-4">Empleado</th>
              <th className="px-6 py-4 text-center">Saldo Préstamos</th>
              <th className="px-6 py-4 text-center">Asignaciones</th>
              <th className="px-6 py-4 text-center">Deducciones</th>
              <th className="px-6 py-4 text-right">Neto a Pagar</th>
              <th className="px-6 py-4 text-center">Estatus</th>
              <th className="px-6 py-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.filter(emp => {
                if (selectedBranchId && emp.sucursal_id !== selectedBranchId) return false;
                if (employeeSearch.trim()) {
                  const q = employeeSearch.toLowerCase().trim();
                  const fullName = `${emp.nombre} ${emp.apellido}`.toLowerCase();
                  const cedula = (emp.cedula || '').toLowerCase();
                  if (!fullName.includes(q) && !cedula.includes(q)) return false;
                }
                return true;
            }).sort((a, b) => {
                const dir = sortDirection === 'asc' ? 1 : -1;
                if (sortField === 'nombre') {
                  return dir * `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`);
                }
                if (sortField === 'cedula') {
                  return dir * (a.cedula || '').localeCompare(b.cedula || '');
                }
                // For numeric sorts, compute breakdowns
                const bA = getPayrollBreakdown(a);
                const bB = getPayrollBreakdown(b);
                if (!bA || !bB) return 0;
                if (sortField === 'asignaciones') return dir * (bA.totalAsignaciones - bB.totalAsignaciones);
                if (sortField === 'deducciones') return dir * (bA.totalDeducciones - bB.totalDeducciones);
                if (sortField === 'neto') return dir * (bA.neto - bB.neto);
                return 0;
            }).map(emp => {
                if (!config) return null;

                const snapshot = nominasCerradas.find(n => n.empleado_id === emp.id);
                const isClosed = !!snapshot;
                const breakdown = isClosed ? snapshot.detalles_calculo : getPayrollBreakdown(emp);
                const prestamosData = getPrestamoSaldoByEmployee(emp.id);

                if (!breakdown) return null;

                const isExcluded = excludedEmployees[emp.id] || false;

                return (
                  <tr key={emp.id} className={`hover:bg-slate-50 transition-colors ${isClosed ? 'bg-slate-50/30' : ''} ${isExcluded ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-4 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        checked={!isExcluded}
                        onChange={() => setExcludedEmployees(prev => ({ ...prev, [emp.id]: !isExcluded }))}
                        title={isExcluded ? 'Incluir en recibos' : 'Excluir de recibos'}
                      />
                    </td>
                    <td className="px-6 py-4 cursor-pointer group/name" onClick={() => setSelectedDetailEmployeeId(emp.id)}>
                        <div className="font-bold text-slate-700 group-hover/name:text-emerald-600 transition-colors">{emp.nombre} {emp.apellido}</div>
                        <div className="text-xs text-slate-400 font-medium">C.I. {emp.cedula}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setLoanDetailEmployeeId(emp.id)}
                          className="w-full rounded-xl p-2 hover:bg-slate-50 transition-colors"
                          title="Ver detalle de préstamos"
                        >
                          <div className={`font-black ${prestamosData.totalSaldoPendiente > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            Bs. {prestamosData.totalSaldoPendiente.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </div>
                          {prestamosData.cantidad > 0 ? (
                            <span className="block text-[10px] text-amber-500">{prestamosData.cantidad} préstamo(s) activo(s)</span>
                          ) : (
                            <span className="block text-[10px] text-slate-300">Sin préstamos</span>
                          )}
                        </button>
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-emerald-600">
                        + {breakdown.totalAsignaciones.toLocaleString('es-VE', {minimumFractionDigits: 2})}
                    </td>
                    <td className="px-6 py-4 text-center text-rose-500 font-medium">
                        - {breakdown.totalDeducciones.toLocaleString('es-VE', {minimumFractionDigits: 2})}
                        {breakdown.totalAdelantos > 0 && (
                            <span className="block text-[10px] text-rose-400">(Inc. {breakdown.totalAdelantos.toLocaleString('es-VE')} adelanto/préstamo)</span>
                        )}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-black text-emerald-700 text-base">Bs. {breakdown.neto.toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        title={isClosed ? 'Nómina cerrada para este período' : "Usa 'Cerrar Quincena' para finalizar este período"}
                        className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest cursor-default ${isClosed ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}
                      >
                        {isClosed ? 'Cerrado ✓' : 'Pend. cierre'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {!isClosed && (
                          <button
                            onClick={() => {
                              setSelectedEmployeeId(emp.id);
                              setAdelantoTipo('adelanto_nomina');
                              setAdelantoMonto('');
                              setAdelantoCuota('');
                              setAdelantoMotivo('');
                              setShowAdelantoModal(true);
                            }}
                            className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-all text-[10px] font-bold whitespace-nowrap"
                            title="Registrar Adelanto"
                          >
                            <span>💸</span> Adelanto
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setReceiptConfigEmployeeId(emp.id);
                            const hasSaved = emp.receipt_print_config && Object.keys(emp.receipt_print_config).length > 0;
                            setReceiptConfig(hasSaved ? normalizeReceiptPrintConfig(emp.receipt_print_config) : buildAttendanceDrivenReceiptConfig(emp));
                            setShowConfigModal(true);
                          }}
                          className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-all text-[10px] font-bold whitespace-nowrap"
                          title="Configurar Recibo Individual"
                        >
                          <span>⚙️</span> Recibo
                        </button>
                        <button
                          onClick={() => generatePDF(emp, breakdown)}
                          className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-emerald-100 rounded-lg text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all text-[10px] font-bold shadow-sm whitespace-nowrap"
                          title="Descargar Recibo PDF"
                        >
                          <span>📄</span> PDF
                        </button>
                        <button
                          onClick={() => generateCestaticketPDF(emp)}
                          className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-amber-100 rounded-lg text-amber-700 hover:bg-amber-600 hover:text-white transition-all text-[10px] font-bold shadow-sm whitespace-nowrap"
                          title="Descargar Recibo de Cestaticket"
                        >
                          <span>🍽️</span> Cesta
                        </button>
                      </div>
                    </td>
                  </tr>
                );
            })}
          </tbody>
          <tfoot>
            {(() => {
              const filtered = employees.filter(emp => selectedBranchId ? emp.sucursal_id === selectedBranchId : true);
              const included = filtered.filter(emp => !excludedEmployees[emp.id]);
              let totalAsig = 0, totalDed = 0, totalNeto = 0;
              included.forEach(emp => {
                if (!config) return;
                const snapshot = nominasCerradas.find(n => n.empleado_id === emp.id);
                const breakdown = snapshot ? snapshot.detalles_calculo : getPayrollBreakdown(emp);
                if (!breakdown) return;
                totalAsig += breakdown.totalAsignaciones;
                totalDed += breakdown.totalDeducciones;
                totalNeto += breakdown.neto;
              });
              return (
                <tr className="bg-slate-900 text-white border-t-2 border-slate-700">
                  <td colSpan={3} className="px-6 py-4 font-black text-sm">
                    Totales — {included.length} de {filtered.length} empleados
                  </td>
                  <td className="px-6 py-4 text-center font-black text-emerald-400">
                    + {totalAsig.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center font-black text-rose-400">
                    - {totalDed.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-black text-emerald-300 text-base">
                    Bs. {totalNeto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
        </div>
      </div>
      )}

      {activeTab === 'prorrateo' && (() => {
        // Para prorrateo: incluir empleado si su sucursal principal coincide
        // O si tiene registros de asistencia en esa sucursal (multi-sucursal)
        const filteredEmps = employees.filter(emp => {
          if (!selectedBranchId) return true;
          if (emp.sucursal_id === selectedBranchId) return true;
          // Multi-sucursal: empleado trabajó en esta sucursal durante el período
          return attendances.some(a =>
            a.empleado_id === emp.id && a.sucursal_id === selectedBranchId
          );
        });
        const rawTasa = Number(config?.tasa_bcv ?? 0);
        const tasa = Number.isFinite(rawTasa) && rawTasa > 0 ? rawTasa : 0.0001;
        const horasBaseQuincena = 120; // 15 días * 8 horas = 120 horas base

        const empHoursData = filteredEmps.map(emp => {
          // Para prorrateo: solo contar horas trabajadas EN esta sucursal específica.
          // Registros sin sucursal_id (datos anteriores) se atribuyen a la sucursal principal del empleado.
          const empAsistencias = selectedBranchId
            ? attendances.filter(a =>
                a.empleado_id === emp.id &&
                (a.sucursal_id === selectedBranchId ||
                  (!a.sucursal_id && emp.sucursal_id === selectedBranchId))
              )
            : attendances.filter(a => a.empleado_id === emp.id);
           const hoursData = processAttendanceRecords(empAsistencias);
          // El prorrateo debe contemplar todas las horas efectivamente laboradas,
          // incluyendo jornadas en descanso, fines de semana y turnos nocturnos.
          const totalHrs =
            hoursData.totalNormal +
            hoursData.totalExtraDiurna +
            hoursData.totalExtraNocturna +
            hoursData.totalDescanso;
           return { emp, totalHrs };
        });

        // Totales de la sucursal / reporte actual
        let globalPoteRepartidoBs = 0;
        empHoursData.forEach(({ emp, totalHrs }) => {
            const baseInd = montoIndicador[emp.id] || 0;
            const perc = (porcentajeRepartir[emp.id] ?? 100) / 100;
            const maxPoteP = baseInd * perc;
            const bonoBs = (maxPoteP / horasBaseQuincena) * totalHrs;
            globalPoteRepartidoBs += bonoBs;
        });

        return (
          <div className="space-y-6">
            {/* Panel de Resumen de Prorrateo */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
               <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 shadow-inner">
                 <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Bono Proyectado a Pagar (Sucursal)</div>
                 <div className="flex items-center gap-2 mt-2">
                   <span className="text-sm font-bold text-indigo-700">Bs.</span>
                   <input
                     type="number"
                     className="w-40 p-2 border border-indigo-200 rounded-lg text-xl font-black text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                     value={globalBonoBs}
                     onChange={(e) => {
                       const val = e.target.value === '' ? '' : Number(e.target.value);
                       setGlobalBonoBs(val);
                       setGlobalBonoUsd(val === '' ? '' : val / tasa);
                       const valNum = Number(val) || 0;
                       const newMonto = { ...montoIndicador };
                       filteredEmps.forEach(emp => {
                         newMonto[emp.id] = valNum;
                       });
                       setMontoIndicador(newMonto);
                     }}
                     placeholder="0"
                   />
                   <span className="text-sm font-bold text-indigo-700">%</span>
                   <input
                     type="number"
                     className="w-20 p-2 border border-indigo-200 rounded-lg text-xl font-black text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                     value={globalBonoPerc}
                     onChange={(e) => {
                       const val = e.target.value === '' ? '' : Number(e.target.value);
                       setGlobalBonoPerc(val);
                       const valNum = Number(val) || 0;
                       const newPerc = { ...porcentajeRepartir };
                       filteredEmps.forEach(emp => {
                         newPerc[emp.id] = valNum;
                       });
                       setPorcentajeRepartir(newPerc);
                     }}
                     placeholder="100"
                   />
                 </div>
                 <div className="flex items-center gap-2 mt-2">
                   <span className="text-sm font-bold text-indigo-700 w-[18px] text-center">$</span>
                   <input
                     type="number"
                     className="w-40 p-2 border border-indigo-200 rounded-lg text-xl font-black text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                     value={globalBonoUsd === '' ? '' : Number(globalBonoUsd).toFixed(2)}
                     onChange={(e) => {
                       const val = e.target.value === '' ? '' : Number(e.target.value);
                       setGlobalBonoUsd(val);
                       const valBs = val === '' ? '' : val * tasa;
                       setGlobalBonoBs(valBs);
                       const valNumBs = Number(valBs) || 0;
                       const newMonto = { ...montoIndicador };
                       filteredEmps.forEach(emp => {
                         newMonto[emp.id] = valNumBs;
                       });
                       setMontoIndicador(newMonto);
                     }}
                     placeholder="0.00"
                   />
                 </div>
                 <div className="text-[10px] font-bold text-indigo-500/80 mt-3 pt-2 border-t border-indigo-200/50 flex justify-between items-center">
                   <span>TOTAL A REPARTIR CALCULADO:</span>
                   <span className="text-sm text-indigo-700">
                     Bs. {globalPoteRepartidoBs.toLocaleString('es-VE', {minimumFractionDigits:2})}
                     <span className="font-medium opacity-80 text-xs ml-1">(≈ ${(globalPoteRepartidoBs / tasa).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} USD)</span>
                   </span>
                 </div>
               </div>

               <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner flex flex-col justify-center">
                 <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-2">Resumen Global</div>
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-sm font-bold text-slate-600">Total Empleados:</span>
                   <span className="text-lg font-black text-slate-800">{empHoursData.length}</span>
                 </div>
                 <div className="flex justify-between items-center">
                   <span className="text-sm font-bold text-slate-600">Total a Pagar Global:</span>
                   <div className="text-right">
                     <div className="text-lg font-black text-emerald-600">
                        Bs. {empHoursData.reduce((acc, { emp, totalHrs }) => {
                          const baseIndBs = montoIndicador[emp.id] || 0;
                          const perc = (porcentajeRepartir[emp.id] ?? 100) / 100;
                          const bonoBs = ((baseIndBs * perc) / 120) * totalHrs;
                          const customAssignUsd = extraAssigns[emp.id] || 0;
                          const customDeductUsd = extraDeductions[emp.id] || 0;
                          const isExcluded = excludedEmployees[emp.id] || false;
                          const bBs = isExcluded ? 0 : bonoBs;
                          return acc + bBs + (customAssignUsd - customDeductUsd) * tasa;
                        }, 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                     </div>
                     <div className="text-xs font-bold text-slate-500 mt-0.5">
                        ≈ $ {empHoursData.reduce((acc, { emp, totalHrs }) => {
                          const baseIndBs = montoIndicador[emp.id] || 0;
                          const perc = (porcentajeRepartir[emp.id] ?? 100) / 100;
                          const bonoUsd = (((baseIndBs * perc) / 120) * totalHrs) / tasa;
                          const customAssignUsd = extraAssigns[emp.id] || 0;
                          const customDeductUsd = extraDeductions[emp.id] || 0;
                          const isExcluded = excludedEmployees[emp.id] || false;
                          const bUsd = isExcluded ? 0 : bonoUsd;
                          return acc + bUsd + customAssignUsd - customDeductUsd;
                        }, 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} USD
                     </div>
                   </div>
                 </div>
                 <div className="mt-4 pt-3 border-t border-slate-200">
                    <button
                      onClick={saveProrrateoConfig}
                      className="w-full bg-emerald-600 text-white py-2 rounded-lg text-xs font-black uppercase hover:bg-emerald-700 transition-colors shadow-sm flex justify-center items-center gap-2"
                    >
                      <span>💾</span> Guardar Configuración Global
                    </button>
                 </div>
               </div>

            </div>

            {/* Tabla de Desglose de Prorrateo */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-[#F8F9FB] border-b border-slate-100 flex justify-between items-center">
                 <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Configuración Individual de Pago</h4>
                 <button
                   type="button"
                   onClick={() => {
                     const allData = empHoursData.filter(({ emp }) => !excludedEmployees[emp.id]).map(({ emp, totalHrs }) => {
                       const baseIndBs = montoIndicador[emp.id] || 0;
                       const perc = (porcentajeRepartir[emp.id] ?? 100) / 100;
                       const maxPote = baseIndBs * perc;
                       const bonoBs = (maxPote / horasBaseQuincena) * totalHrs;
                       const bonoUsd = bonoBs / tasa;
                       const customAssignUsd = extraAssigns[emp.id] || 0;
                       const customDeductUsd = extraDeductions[emp.id] || 0;
                       const totalNetoUsd = bonoUsd + customAssignUsd - customDeductUsd;
                       const totalNetoBs = totalNetoUsd * tasa;
                       return { emp, totalHrs, maxPote, bonoBs, bonoUsd, customAssignUsd, customDeductUsd, totalNetoUsd, totalNetoBs, horasBaseQuincena, tasa };
                     });
                     generateGlobalReceipt2PDF(allData);
                   }}
                   className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                 >
                    <span>🖨️</span> Imprimir Lote (Recibo 2)
                 </button>
                 <button
                   type="button"
                   onClick={() => {
                     const allData = empHoursData.filter(({ emp }) => !excludedEmployees[emp.id]).map(({ emp, totalHrs }) => {
                       const baseIndBs = montoIndicador[emp.id] || 0;
                       const perc = (porcentajeRepartir[emp.id] ?? 100) / 100;
                       const maxPote = baseIndBs * perc;
                       const bonoBs = (maxPote / horasBaseQuincena) * totalHrs;
                       const bonoUsd = bonoBs / tasa;
                       const customAssignUsd = extraAssigns[emp.id] || 0;
                       const customDeductUsd = extraDeductions[emp.id] || 0;
                       const totalNetoUsd = bonoUsd + customAssignUsd - customDeductUsd;
                       const totalNetoBs = totalNetoUsd * tasa;
                       return { emp, totalHrs, maxPote, bonoBs, bonoUsd, customAssignUsd, customDeductUsd, totalNetoUsd, totalNetoBs, horasBaseQuincena, tasa };
                     });
                     generateGeneralPaymentProrrateoPDF(allData);
                   }}
                   className="bg-violet-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-violet-800 transition-colors shadow-lg shadow-violet-700/20 flex items-center gap-2"
                 >
                    <span>📋</span> Planilla General Prorrateo
                 </button>
                 <button
                   type="button"
                   onClick={() => {
                     const allData = empHoursData.filter(({ emp }) => !excludedEmployees[emp.id]).map(({ emp, totalHrs }) => {
                       const baseIndBs = montoIndicador[emp.id] || 0;
                       const perc = (porcentajeRepartir[emp.id] ?? 100) / 100;
                       const maxPote = baseIndBs * perc;
                       const bonoBs = (maxPote / horasBaseQuincena) * totalHrs;
                       const bonoUsd = bonoBs / tasa;
                       const customAssignUsd = extraAssigns[emp.id] || 0;
                       const customDeductUsd = extraDeductions[emp.id] || 0;
                       const totalNetoUsd = bonoUsd + customAssignUsd - customDeductUsd;
                       const totalNetoBs = totalNetoUsd * tasa;
                       return { emp, totalHrs, maxPote, bonoBs, bonoUsd, customAssignUsd, customDeductUsd, totalNetoUsd, totalNetoBs, horasBaseQuincena, tasa };
                     });
                     generateReciboGeneralProrrateoPDF(allData);
                   }}
                   className="bg-teal-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-teal-800 transition-colors shadow-lg shadow-teal-700/20 flex items-center gap-2"
                 >
                    <span>📑</span> Recibo General Prorrateo
                 </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-4 w-10 text-center"><input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer" onChange={(e) => {
    const isChecked = e.target.checked;
    const newExcluded = {...excludedEmployees};
    empHoursData.forEach(({emp}) => {
        newExcluded[emp.id] = isChecked;
    });
    setExcludedEmployees(newExcluded);
}} checked={empHoursData.length > 0 && empHoursData.every(({emp}) => excludedEmployees[emp.id])} /></th>
                      <th className="px-6 py-4">Empleado</th>
                      <th className="px-6 py-4 text-center">Configuración Pote</th>
                      <th className="px-6 py-4 text-center">Horas Laboradas</th>
                      <th className="px-6 py-4 text-right">Bono Prorrateo (Bs / USD)</th>
                      <th className="px-6 py-4 text-center">Asign. ($)</th>
                      <th className="px-6 py-4 text-center">Deduc. ($)</th>
                      <th className="px-6 py-4 text-right bg-slate-50">Total Neto a Pagar</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {empHoursData.map(({ emp, totalHrs }) => {
                       // Lógica individual
                       const baseIndBs = montoIndicador[emp.id] || 0;
                       const baseIndUsd = baseIndBs / tasa;
                       const perc = (porcentajeRepartir[emp.id] ?? 100) / 100;
                       const percInt = porcentajeRepartir[emp.id] ?? 100;

                       const maxPote = baseIndBs * perc;
                       
                       const bonoBs = (maxPote / horasBaseQuincena) * totalHrs;
                       const bonoUsd = bonoBs / tasa;
                       
                       const customAssignUsd = extraAssigns[emp.id] || 0;
                       const customDeductUsd = extraDeductions[emp.id] || 0;
                       
                       const totalNetoUsd = bonoUsd + customAssignUsd - customDeductUsd;
                       const totalNetoBs = totalNetoUsd * tasa;

                       const isExcluded = excludedEmployees[emp.id] || false;
                       const finalBonoBs = isExcluded ? 0 : bonoBs;
                       const finalBonoUsd = isExcluded ? 0 : bonoUsd;
                       const finalTotalNetoUsd = finalBonoUsd + customAssignUsd - customDeductUsd;
                       const finalTotalNetoBs = finalTotalNetoUsd * tasa;

                       const individualProrrateoData = {
                          emp, totalHrs, maxPote, bonoBs: finalBonoBs, bonoUsd: finalBonoUsd, customAssignUsd, customDeductUsd, totalNetoUsd: finalTotalNetoUsd, totalNetoBs: finalTotalNetoBs, horasBaseQuincena, tasa,
                          extraAssignName: extraAssignsData[emp.id]?.nombre || 'Primas Extra'
                       };

                       return (
                         <tr key={emp.id} className={`hover:bg-slate-50/50 transition-colors ${isExcluded ? 'opacity-50 grayscale' : ''}`}>
                           <td className="px-4 py-4 text-center">
                              <input
                                type="checkbox"
                                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                checked={isExcluded}
                                onChange={(e) => setExcludedEmployees(prev => ({...prev, [emp.id]: e.target.checked}))}
                              />
                           </td>
                           <td className="px-6 py-4">
                             <div className="font-bold text-slate-700">{emp.nombre} {emp.apellido}</div>
                             <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{emp.cargo}</div>
                           </td>
                           <td className="px-6 py-4">
                              <div className="flex flex-col gap-2 w-48">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-slate-400 w-16">Monto:</span>
                                  <input 
                                    type="number" 
                                    className="w-full p-1.5 border border-slate-200 rounded text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                    value={baseIndBs || ''}
                                    placeholder="0"
                                    onChange={(e) => setMontoIndicador(prev => ({...prev, [emp.id]: Number(e.target.value)}))}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-slate-400 w-16">Porcent:</span>
                                  <input 
                                    type="number" 
                                    className="w-full p-1.5 border border-slate-200 rounded text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                    value={percInt || ''}
                                    placeholder="100"
                                    onChange={(e) => setPorcentajeRepartir(prev => ({...prev, [emp.id]: Number(e.target.value)}))}
                                  />
                                </div>
                                {baseIndBs > 0 && (
                                   <div className="text-[9px] text-indigo-400 font-bold mt-1 text-right">
                                      Máx ≈ ${(baseIndUsd * perc).toFixed(2)} USD
                                   </div>
                                )}
                              </div>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <span className={`px-3 py-1 font-bold rounded-lg text-xs ${totalHrs >= horasBaseQuincena ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                               {totalHrs.toFixed(2)} / {horasBaseQuincena}
                             </span>
                           </td>
                           <td className="px-6 py-4 text-right">
                             <div className="font-bold text-indigo-600">Bs. {bonoBs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                             <div className="text-[10px] font-black text-slate-400 mt-0.5">${bonoUsd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</div>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <button
                               type="button"
                               onClick={() => {
                                  setSelectedExtraAssignEmpId(emp.id);
                                  setShowExtraAssignModal(true);
                               }}
                               className="flex flex-col items-center justify-center w-full p-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                             >
                               {customAssignUsd > 0 ? (
                                 <>
                                   <div className="text-sm font-black text-emerald-600">+ $ {customAssignUsd.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                                   <div className="text-[9px] font-bold text-emerald-700/70 truncate w-full px-1">{extraAssignsData[emp.id]?.nombre || 'Asignación Extra'}</div>
                                 </>
                               ) : (
                                 <div className="text-xs font-bold text-emerald-600/70 flex items-center gap-1">
                                   <span className="text-lg leading-none">+</span> Agregar
                                 </div>
                               )}
                             </button>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <button
                               type="button"
                               onClick={() => {
                                  setSelectedExtraDeductEmpId(emp.id);
                                  setShowExtraDeductModal(true);
                               }}
                               className="flex flex-col items-center justify-center w-full p-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors"
                             >
                               {customDeductUsd > 0 ? (
                                 <div className="text-sm font-black text-rose-600">- $ {customDeductUsd.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                               ) : (
                                 <div className="text-xs font-bold text-rose-600/70 flex items-center gap-1">
                                   <span className="text-lg leading-none">-</span> Agregar
                                 </div>
                               )}
                             </button>
                           </td>
                           <td className="px-6 py-4 text-right bg-slate-50/50">
                             <div className="font-black text-slate-800 text-base">Bs. {totalNetoBs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                             <div className="text-xs font-black text-emerald-600 mt-0.5">${totalNetoUsd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</div>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <button
                               type="button"
                               onClick={() => generateReceipt2PDF(individualProrrateoData)} 
                               className="p-2 bg-indigo-100 rounded-lg text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm tooltip"
                               title="Imprimir Recibo de Prorrateo Individual"
                             >
                               📄
                             </button>
                           </td>
                         </tr>
                       );
                    })}
                    {empHoursData.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                          No hay empleados para mostrar en esta sucursal
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default PayrollProcessor;
