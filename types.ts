
export interface ReceiptItem {
  enabled: boolean;
  cantidad?: number;
  montoUnitario?: number;
}

export interface ReceiptPrintConfig {
  diasLaborados: ReceiptItem;
  diasDescanso: ReceiptItem;
  descansoLaborado: ReceiptItem;
  domingoLaborado: ReceiptItem;
  horasExtrasDiurnas: ReceiptItem;
  feriadosLaborados: ReceiptItem;
  bonoNocturno: ReceiptItem;
  turnosLaborados: ReceiptItem;
  bonoJornadaMixta: ReceiptItem;
  horasExtrasNocturnas: ReceiptItem;
  diasCompensatorios: ReceiptItem;
  sabadoLaborado: ReceiptItem;
  bonoAlimentacion: ReceiptItem;
  otrasAsignaciones: ReceiptItem;
  vales: ReceiptItem;
  sso: ReceiptItem;
  rpe: ReceiptItem;
  faov: ReceiptItem;
  islr: ReceiptItem;
  adelantoNomina: ReceiptItem;
  prestamo: ReceiptItem;
}

export interface ConfigGlobal {
  id: string;
  tasa_bcv: number;
  cestaticket_usd: number;
  salario_minimo_vef: number;
  dias_utilidades: number;
  dias_bono_vacacional_base: number;
  receipt_print_config?: Partial<ReceiptPrintConfig> | null;
  prorrateo_config?: any;
  theme?: string;
  accent_color?: string;
  updated_at: string;
}

export interface CargaFamiliar {
  id?: string;
  nombre_completo: string;
  parentesco: 'Hijo' | 'Hija' | 'Cónyuge' | 'Padre' | 'Madre';
  fecha_nacimiento: string;
  es_menor: boolean;
}

export interface Empleado {
  id: string;
  cedula: string;
  rif: string;
  nombre: string;
  apellido: string;
  cargo: string;
  fecha_ingreso: string;
  fecha_inicio_contrato?: string;
  salario_usd: number;
  salario_base_vef: number;
  activo: boolean;
  foto_url?: string;
  cv_url?: string;
  sucursal_id?: string;
  prestaciones_acumuladas_vef?: number;
  receipt_print_config?: Partial<ReceiptPrintConfig> | null;

  // Nuevos campos Legales/Personales
  fecha_nacimiento?: string;
  lugar_nacimiento?: string;
  nacionalidad?: string;
  sexo?: 'M' | 'F' | 'Otro';
  estado_civil?: 'Soltero' | 'Casado' | 'Divorciado' | 'Viudo' | 'Concubinato';
  mano_dominante?: 'Derecho' | 'Zurdo' | 'Ambidiestro';
  direccion_habitacion?: string;
  telefono_movil?: string;
  telefono_fijo?: string;
  email_personal?: string;
  contacto_emergencia_nombre?: string;
  contacto_emergencia_telefono?: string;
  tipo_contrato?: string;
  duracion_contrato_meses?: number;
  estado_laboral?: 'Activo' | 'Suspendido' | 'Vacaciones';
  tipo_sangre?: string;
  alergias?: string;
  departamento?: string;
  tipo_jornada?: string;
  bono_alimentacion_frecuencia?: string;

  sucursales?: {
    id: string;
    nombre_id: string;
    rif: string;
    es_principal: boolean;
    direccion?: string;
  };
  cargas_familiares?: CargaFamiliar[];
}

export interface Sucursal {
  id: string;
  nombre_id: string;
  rif: string;
  direccion: string;
  administrador: string;
  correo_admin: string;
  logo_url?: string;
  es_principal: boolean;
}

export interface Nomina {
  id: string;
  empleado_id: string;
  mes: number;
  anio: number;
  quincena?: 'Q1' | 'Q2';
  dias_trabajados: number;
  tasa_aplicada: number;
  sueldo_base_vef: number;
  bono_alimentacion_vef: number;
  deduccion_ivss: number;
  deduccion_faov: number;
  deduccion_spf: number;
  total_asignaciones_vef?: number;
  total_deducciones_vef?: number;
  neto_pagar_vef: number;
  pagado: boolean;
  detalles_calculo?: any;
  created_at?: string;
  empleados?: Empleado;
}

export interface Adelanto {
  id: string;
  empleado_id: string;
  monto: number;
  fecha_solicitud: string;
  motivo?: string;
  estado: 'pendiente' | 'aprobado' | 'pagado' | 'rechazado';
  tipo?: 'adelanto_nomina' | 'prestamo_credito';
  cuota_quincenal?: number | null;
  saldo_pendiente?: number | null;
  ultimo_periodo_descuento?: string | null;
  created_at?: string;
}

export interface Asistencia {
  id: string;
  empleado_id: string;
  fecha: string;
  estado: 'presente' | 'falta' | 'reposo' | 'vacaciones';
  hora_entrada?: string;
  hora_salida?: string;
  observaciones?: string;
  cerrado?: boolean;
}
