import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { CargaFamiliar, Empleado, Sucursal, ConfigGlobal } from '../types.ts';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeToEdit?: Empleado | null;
  config: ConfigGlobal | null;
}

interface EmployeeForm {
  cedula: string;
  rif: string;
  nombre: string;
  apellido: string;
  cargo: string;
  fecha_ingreso: string;
  fecha_inicio_contrato: string;
  salario_usd: number;
  salario_base_vef: number;
  activo: boolean;
  foto_url: string;
  cv_url: string;
  sucursal_id: string;
  fecha_nacimiento: string;
  lugar_nacimiento: string;
  nacionalidad: string;
  sexo: 'M' | 'F' | 'Otro';
  estado_civil: 'Soltero' | 'Casado' | 'Divorciado' | 'Viudo' | 'Concubinato';
  direccion_habitacion: string;
  telefono_movil: string;
  telefono_fijo: string;
  email_personal: string;
  contacto_emergencia_nombre: string;
  contacto_emergencia_telefono: string;
  tipo_contrato: string;
  departamento: string;
  tipo_jornada: string;
  bono_alimentacion_frecuencia: string;
  tipo_sangre: string;
  alergias: string;
  duracion_contrato_meses: number;

  mano_dominante: 'Derecho' | 'Zurdo' | 'Ambidiestro' | '';
  estado_laboral: 'Activo' | 'Suspendido' | 'Vacaciones';
}

type TabId = 'personal' | 'contacto' | 'documentos' | 'laboral' | 'salud' | 'familia';

const getToday = () => new Date().toISOString().split('T')[0];

const getDefaultFormData = (): EmployeeForm => ({

  cedula: '',
  rif: '',
  nombre: '',
  apellido: '',
  cargo: 'General',
  fecha_ingreso: getToday(),
  fecha_inicio_contrato: getToday(),
  salario_usd: 0,
  salario_base_vef: 0,
  activo: true,
  foto_url: '',
  cv_url: '',
  sucursal_id: '',
  fecha_nacimiento: '',
  lugar_nacimiento: '',
  nacionalidad: 'Venezolana',
  sexo: 'M',
  estado_civil: 'Soltero',
  direccion_habitacion: '',
  telefono_movil: '',
  telefono_fijo: '',
  email_personal: '',
  contacto_emergencia_nombre: '',
  contacto_emergencia_telefono: '',
  tipo_contrato: 'Indeterminado',
  departamento: 'Farmacia',
  tipo_jornada: 'Tiempo Completo',
  bono_alimentacion_frecuencia: 'Mensual',
  tipo_sangre: '',
  alergias: '',
  duracion_contrato_meses: 0,
  mano_dominante: '',
  estado_laboral: 'Activo',
});

const toStringValue = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
};

const toNumberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return fallback;
};

const normalizeEmployeeToForm = (employee: Empleado): EmployeeForm => ({
  cedula: toStringValue(employee.cedula),
  rif: toStringValue(employee.rif),
  nombre: toStringValue(employee.nombre),
  apellido: toStringValue(employee.apellido),
  cargo: toStringValue(employee.cargo, 'General'),
  fecha_ingreso: toStringValue(employee.fecha_ingreso, getToday()),
  fecha_inicio_contrato: toStringValue(employee.fecha_inicio_contrato, toStringValue(employee.fecha_ingreso, getToday())),
  salario_usd: toNumberValue(employee.salario_usd, 0),
  salario_base_vef: toNumberValue(employee.salario_base_vef, 0),
  activo: employee.activo ?? true,
  foto_url: toStringValue(employee.foto_url),
  cv_url: toStringValue(employee.cv_url),
  sucursal_id: toStringValue(employee.sucursal_id),
  fecha_nacimiento: toStringValue(employee.fecha_nacimiento),
  lugar_nacimiento: toStringValue(employee.lugar_nacimiento),
  nacionalidad: toStringValue(employee.nacionalidad, 'Venezolana'),
  sexo: (toStringValue(employee.sexo, 'M') as EmployeeForm['sexo']) || 'M',
  estado_civil: (toStringValue(employee.estado_civil, 'Soltero') as EmployeeForm['estado_civil']) || 'Soltero',
  direccion_habitacion: toStringValue(employee.direccion_habitacion),
  telefono_movil: toStringValue(employee.telefono_movil),
  telefono_fijo: toStringValue(employee.telefono_fijo),
  email_personal: toStringValue(employee.email_personal),
  contacto_emergencia_nombre: toStringValue(employee.contacto_emergencia_nombre),
  contacto_emergencia_telefono: toStringValue(employee.contacto_emergencia_telefono),
  tipo_contrato: toStringValue(employee.tipo_contrato, 'Indeterminado'),
  departamento: toStringValue(employee.departamento, 'Farmacia'),
  tipo_jornada: toStringValue(employee.tipo_jornada, 'Tiempo Completo'),
  bono_alimentacion_frecuencia: toStringValue(employee.bono_alimentacion_frecuencia, 'Mensual'),
  tipo_sangre: toStringValue(employee.tipo_sangre),
  alergias: toStringValue(employee.alergias),
  duracion_contrato_meses: toNumberValue(employee.duracion_contrato_meses, 0),
  mano_dominante: (toStringValue(employee.mano_dominante, '') as EmployeeForm['mano_dominante']),
  estado_laboral: (toStringValue(employee.estado_laboral, 'Activo') as EmployeeForm['estado_laboral']),
});

const tabs: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'personal', label: '1. Identidad', icon: '👤' },
  { id: 'contacto', label: '2. Contacto y Ubicación', icon: '📞' },
  { id: 'documentos', label: '3. Documentos', icon: '📄' },
  { id: 'laboral', label: '4. Laboral y Contrato', icon: '💼' },
  { id: 'salud', label: '5. Salud y Emergencia', icon: '❤️' },
  { id: 'familia', label: '6. Cargas Familiares', icon: '👨‍👩‍👧' },
];

const EmployeeModal: React.FC<EmployeeModalProps> = ({ isOpen, onClose, employeeToEdit, config }) => {
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [branches, setBranches] = useState<Sucursal[]>([]);
  const [family, setFamily] = useState<CargaFamiliar[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cvName, setCvName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EmployeeForm>(getDefaultFormData());

  const tasaBcv = config?.tasa_bcv || 0;

  const photoInputRef = useRef<HTMLInputElement>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data: bData } = await supabase.from('sucursales').select('id, nombre_id').order('nombre_id');
      if (bData) setBranches(bData);

      setActiveTab('personal');
      setFormError(null);

      if (employeeToEdit) {
        setFormData(normalizeEmployeeToForm(employeeToEdit));
        setPhotoPreview(employeeToEdit.foto_url || null);
        setCvName(employeeToEdit.cv_url ? employeeToEdit.cv_url.split('/').pop() || 'Documento cargado' : null);

        const { data: fData } = await supabase
          .from('cargas_familiares')
          .select('*')
          .eq('empleado_id', employeeToEdit.id);
        setFamily(
          ((fData as any[]) || []).map((member) => ({
            id: member.id,
            nombre_completo: toStringValue(member.nombre_completo),
            parentesco: (toStringValue(member.parentesco, 'Hijo') as CargaFamiliar['parentesco']) || 'Hijo',
            fecha_nacimiento: toStringValue(member.fecha_nacimiento),
            es_menor: member.es_menor ?? true,
          }))
        );
      } else {
        setFormData(getDefaultFormData());
        setPhotoPreview(null);
        setCvName(null);
        setFamily([]);
      }
    };

    if (isOpen) init();
  }, [isOpen, employeeToEdit]);

  if (!isOpen) return null;

  const inputClasses =
    'w-full px-5 py-4 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium outline-none transition-all focus:ring-2 focus:ring-emerald-500/50 placeholder:text-slate-400';
  const labelClasses = 'text-[10px] font-black text-emerald-500 uppercase mb-2 block tracking-wider';

  const updateField = <K extends keyof EmployeeForm>(field: K, value: EmployeeForm[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (file: File, type: 'photo' | 'cv') => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${type}_${formData.cedula || 'temp'}_${Date.now()}.${fileExt}`;
    const filePath = `${formData.cedula || 'unassigned'}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('expedientes').upload(filePath, file);
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from('expedientes').getPublicUrl(filePath);

    return publicUrl;
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCvName(file.name);
  };

  const handleSalarioBsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const bsAmount = Number.isNaN(val) ? 0 : val;
    const usdAmount = tasaBcv > 0 && bsAmount > 0 ? parseFloat((bsAmount / tasaBcv).toFixed(2)) : 0;

    setFormData((prev) => ({
      ...prev,
      salario_base_vef: bsAmount,
      salario_usd: usdAmount,
    }));
  };

  const updateFamilyMember = (index: number, field: keyof CargaFamiliar, value: any) => {
    const next = [...family];
    next[index] = { ...next[index], [field]: value };
    setFamily(next);
  };

  const requiredChecks: Array<{ valid: boolean; tab: TabId; label: string }> = [
    { valid: formData.nombre.trim().length > 0, tab: 'personal', label: 'Nombres' },
    { valid: formData.apellido.trim().length > 0, tab: 'personal', label: 'Apellidos' },
    { valid: formData.cedula.trim().length > 0, tab: 'personal', label: 'Cédula' },
    { valid: formData.cargo.trim().length > 0, tab: 'laboral', label: 'Cargo' },
    { valid: formData.fecha_ingreso.trim().length > 0, tab: 'laboral', label: 'Fecha de ingreso' },
    { valid: formData.salario_base_vef > 0, tab: 'laboral', label: 'Salario base mensual (Bs.)' },
  ];

  const missingField = requiredChecks.find((field) => !field.valid);
  const hasInvalidFamilyMembers = family.some(
    (member) => !member.nombre_completo?.trim() || !member.fecha_nacimiento
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (missingField) {
      setActiveTab(missingField.tab);
      setFormError(`Completa el campo obligatorio: ${missingField.label}.`);
      return;
    }

    if (hasInvalidFamilyMembers) {
      setActiveTab('familia');
      setFormError('Cada carga familiar debe tener nombre completo y fecha de nacimiento.');
      return;
    }

    setLoading(true);

    try {
      let finalFotoUrl = formData.foto_url;
      let finalCvUrl = formData.cv_url;

      const newPhoto = photoInputRef.current?.files?.[0];
      const newCv = cvInputRef.current?.files?.[0];

      if (newPhoto || newCv) {
        setUploadingFiles(true);
        if (newPhoto) finalFotoUrl = await handleFileUpload(newPhoto, 'photo');
        if (newCv) finalCvUrl = await handleFileUpload(newCv, 'cv');
      }

      const payload = {
        ...formData,
        foto_url: finalFotoUrl,
        cv_url: finalCvUrl,
        sucursal_id: formData.sucursal_id || null,
        fecha_nacimiento: formData.fecha_nacimiento || null,
        fecha_inicio_contrato: formData.fecha_inicio_contrato || null,
        duracion_contrato_meses: formData.tipo_contrato === 'Determinado' ? formData.duracion_contrato_meses : 0,
        mano_dominante: formData.mano_dominante || null,
      };

      let empId = employeeToEdit?.id;
      if (employeeToEdit) {
        const { error } = await supabase.from('empleados').update(payload).eq('id', empId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('empleados').insert([payload]).select().single();
        if (error) throw error;
        empId = data.id;
      }

      if (empId) {
        await supabase.from('cargas_familiares').delete().eq('empleado_id', empId);

        if (family.length > 0) {
          const familyPayload = family.map((member) => ({
            empleado_id: empId,
            nombre_completo: member.nombre_completo.trim(),
            parentesco: member.parentesco,
            fecha_nacimiento: member.fecha_nacimiento,
            es_menor: member.es_menor,
          }));

          const { error: familyError } = await supabase.from('cargas_familiares').insert(familyPayload);
          if (familyError) throw familyError;
        }
      }

      alert('¡Expediente guardado exitosamente!');
      onClose();
    } catch (err: any) {
      const errorMsg = err?.message || 'No se pudo guardar el expediente.';
      setFormError(errorMsg);
      alert('Error al guardar: ' + errorMsg);
    } finally {
      setLoading(false);
      setUploadingFiles(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#F8F9FB] rounded-[3rem] shadow-2xl w-full max-w-5xl my-8 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-white px-8 pt-8 pb-4">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-start gap-4">
              <div className="bg-emerald-100/50 p-3 rounded-2xl">
                <span className="text-3xl">🏥</span>
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 leading-none mb-2">
                  {employeeToEdit ? 'Editar Legajo Digital' : 'Nuevo Legajo Digital'}
                </h2>
                <p className="text-slate-400 text-sm font-medium">
                  Completa la ficha en secciones. Los campos clave están marcados con *.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-all text-slate-400"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <div className="flex gap-8 overflow-x-auto border-b border-slate-100">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-4 px-2 text-xs font-black uppercase tracking-widest transition-all border-b-4 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 max-h-[68vh] overflow-y-auto custom-scrollbar">
          <input type="file" ref={photoInputRef} className="hidden" accept="image/*" onChange={handlePhotoChange} />
          <input type="file" ref={cvInputRef} className="hidden" accept=".pdf,image/*" onChange={handleCvChange} />

          {activeTab === 'personal' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="flex flex-col md:flex-row gap-10 items-start">
                <div
                  onClick={() => photoInputRef.current?.click()}
                  className="w-44 h-56 rounded-[2rem] bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 transition-all overflow-hidden relative group shrink-0 shadow-inner"
                >
                  {photoPreview || formData.foto_url ? (
                    <img src={photoPreview || formData.foto_url} alt="Carnet" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-6">
                      <span className="text-5xl block mb-3">📸</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Foto Carnet
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-emerald-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-black uppercase transition-opacity">
                    Cambiar Imagen
                  </div>
                </div>

                <div className="flex-1 space-y-6 w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClasses}>Nombres *</label>
                      <input
                        required
                        className={inputClasses}
                        placeholder="Ej: Ana María"
                        value={formData.nombre}
                        onChange={(e) => updateField('nombre', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Apellidos *</label>
                      <input
                        required
                        className={inputClasses}
                        placeholder="Ej: Pérez González"
                        value={formData.apellido}
                        onChange={(e) => updateField('apellido', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClasses}>Cédula *</label>
                      <input
                        required
                        className={inputClasses}
                        placeholder="Ej: V-12345678"
                        value={formData.cedula}
                        onChange={(e) => updateField('cedula', e.target.value.toUpperCase().replace(/\s/g, ''))}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>RIF</label>
                      <input
                        className={inputClasses}
                        placeholder="Ej: V-12345678-9"
                        value={formData.rif}
                        onChange={(e) => updateField('rif', e.target.value.toUpperCase().replace(/\s/g, ''))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClasses}>Fecha de Nacimiento</label>
                      <input
                        type="date"
                        className={inputClasses}
                        value={formData.fecha_nacimiento}
                        onChange={(e) => updateField('fecha_nacimiento', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Lugar de Nacimiento</label>
                      <input
                        className={inputClasses}
                        placeholder="Ej: Caracas"
                        value={formData.lugar_nacimiento}
                        onChange={(e) => updateField('lugar_nacimiento', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div>
                      <label className={labelClasses}>Sexo</label>
                      <select
                        className={`${inputClasses} appearance-none cursor-pointer`}
                        value={formData.sexo}
                        onChange={(e) => updateField('sexo', e.target.value as EmployeeForm['sexo'])}
                      >
                        <option value="M">M</option>
                        <option value="F">F</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClasses}>Estado Civil</label>
                      <select
                        className={`${inputClasses} appearance-none cursor-pointer`}
                        value={formData.estado_civil}
                        onChange={(e) =>
                          updateField('estado_civil', e.target.value as EmployeeForm['estado_civil'])
                        }
                      >
                        <option value="Soltero">Soltero</option>
                        <option value="Casado">Casado</option>
                        <option value="Divorciado">Divorciado</option>
                        <option value="Viudo">Viudo</option>
                        <option value="Concubinato">Concubinato</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClasses}>Mano Dominante</label>
                      <select
                        className={`${inputClasses} appearance-none cursor-pointer`}
                        value={formData.mano_dominante}
                        onChange={(e) => updateField('mano_dominante', e.target.value as EmployeeForm['mano_dominante'])}
                      >
                        <option value="">No especificado</option>
                        <option value="Derecho">Derecho</option>
                        <option value="Zurdo">Zurdo</option>
                        <option value="Ambidiestro">Ambidiestro</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClasses}>Nacionalidad</label>
                      <input
                        className={inputClasses}
                        placeholder="Ej: Venezolana"
                        value={formData.nacionalidad}
                        onChange={(e) => updateField('nacionalidad', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contacto' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div>
                <label className={labelClasses}>Dirección de Habitación</label>
                <textarea
                  className={`${inputClasses} h-32 py-4 resize-none`}
                  placeholder="Dirección completa"
                  value={formData.direccion_habitacion}
                  onChange={(e) => updateField('direccion_habitacion', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className={labelClasses}>Teléfono Móvil</label>
                  <input
                    className={inputClasses}
                    inputMode="tel"
                    placeholder="Ej: 0414-1234567"
                    value={formData.telefono_movil}
                    onChange={(e) =>
                      updateField('telefono_movil', e.target.value.replace(/[^0-9+\-() ]/g, ''))
                    }
                  />
                </div>
                <div>
                  <label className={labelClasses}>Teléfono Fijo</label>
                  <input
                    className={inputClasses}
                    inputMode="tel"
                    placeholder="Ej: 0212-1234567"
                    value={formData.telefono_fijo}
                    onChange={(e) =>
                      updateField('telefono_fijo', e.target.value.replace(/[^0-9+\-() ]/g, ''))
                    }
                  />
                </div>
                <div>
                  <label className={labelClasses}>Email Personal</label>
                  <input
                    type="email"
                    className={inputClasses}
                    placeholder="correo@dominio.com"
                    value={formData.email_personal}
                    onChange={(e) => updateField('email_personal', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documentos' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-100">
                  <h4 className="text-xs font-black tracking-widest uppercase text-slate-500 mb-4">Foto de Perfil</h4>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full p-4 border border-dashed border-slate-300 rounded-xl hover:border-emerald-400 transition-all"
                  >
                    {photoPreview || formData.foto_url ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {(photoPreview || formData.foto_url) && (
                    <div className="mt-4">
                      <img
                        src={photoPreview || formData.foto_url}
                        alt="Vista previa"
                        className="h-40 w-full object-cover rounded-xl"
                      />
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-100">
                  <h4 className="text-xs font-black tracking-widest uppercase text-slate-500 mb-4">Curriculum y Soportes</h4>
                  <button
                    type="button"
                    onClick={() => cvInputRef.current?.click()}
                    className="w-full p-4 border border-dashed border-slate-300 rounded-xl hover:border-emerald-400 transition-all"
                  >
                    {cvName || formData.cv_url ? 'Reemplazar documento' : 'Subir documento'}
                  </button>
                  <p className="mt-3 text-xs text-slate-500 truncate">
                    {cvName || (formData.cv_url ? 'Documento cargado previamente' : 'Sin archivo seleccionado')}
                  </p>
                  {formData.cv_url && (
                    <a
                      className="inline-block mt-3 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                      href={formData.cv_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver documento actual
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'laboral' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className={labelClasses}>Cargo Profesional *</label>
                  <input
                    required
                    className={inputClasses}
                    placeholder="Ej: Farmacéutico"
                    value={formData.cargo}
                    onChange={(e) => updateField('cargo', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Departamento / Área</label>
                  <input
                    className={inputClasses}
                    placeholder="Ej: Farmacia, Almacén"
                    value={formData.departamento}
                    onChange={(e) => updateField('departamento', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className={labelClasses}>Sucursal / Sede</label>
                  <select
                    className={`${inputClasses} appearance-none cursor-pointer`}
                    value={formData.sucursal_id}
                    onChange={(e) => updateField('sucursal_id', e.target.value)}
                  >
                    <option value="">-- Sin Asignar --</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.nombre_id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Estatus</label>
                  <select
                    className={`${inputClasses} appearance-none cursor-pointer`}
                    value={formData.estado_laboral}
                    onChange={(e) => {
                      const val = e.target.value as EmployeeForm['estado_laboral'];
                      updateField('estado_laboral', val);
                      updateField('activo', val === 'Activo' || val === 'Vacaciones'); // Mantenemos activo boolean por compatibilidad pero el estado rige
                    }}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Suspendido">Suspendido (Inactivo)</option>
                    <option value="Vacaciones">Vacaciones</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className={labelClasses}>Fecha de Ingreso *</label>
                  <input
                    required
                    type="date"
                    className={inputClasses}
                    value={formData.fecha_ingreso}
                    onChange={(e) => updateField('fecha_ingreso', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Inicio Contrato Actual</label>
                  <input
                    type="date"
                    className={inputClasses}
                    value={formData.fecha_inicio_contrato}
                    onChange={(e) => updateField('fecha_inicio_contrato', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <label className={labelClasses}>Tipo de Contrato</label>
                  <select
                    className={`${inputClasses} appearance-none cursor-pointer`}
                    value={formData.tipo_contrato}
                    onChange={(e) => updateField('tipo_contrato', e.target.value)}
                  >
                    <option value="Indeterminado">Indeterminado</option>
                    <option value="Determinado">Determinado</option>
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Tipo de Jornada</label>
                  <select
                    className={`${inputClasses} appearance-none cursor-pointer`}
                    value={formData.tipo_jornada}
                    onChange={(e) => updateField('tipo_jornada', e.target.value)}
                  >
                    <option value="Tiempo Completo">Tiempo Completo</option>
                    <option value="Medio Tiempo">Medio Tiempo</option>
                    <option value="Nocturna">Nocturna</option>
                    <option value="Mixta">Mixta</option>
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Frecuencia Bono Alimentación</label>
                  <select
                    className={`${inputClasses} appearance-none cursor-pointer`}
                    value={formData.bono_alimentacion_frecuencia}
                    onChange={(e) => updateField('bono_alimentacion_frecuencia', e.target.value)}
                  >
                    <option value="Mensual">Mensual</option>
                    <option value="Quincenal">Quincenal</option>
                    <option value="Semanal">Semanal</option>
                  </select>
                </div>
              </div>

              {formData.tipo_contrato === 'Determinado' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className={labelClasses}>Duración del Contrato (meses)</label>
                    <input
                      type="number"
                      min={1}
                      className={inputClasses}
                      value={formData.duracion_contrato_meses || ''}
                      onChange={(e) => updateField('duracion_contrato_meses', Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative items-start">
                <div>
                  <label className={labelClasses}>Salario Base Mensual (Bs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputClasses} text-2xl font-bold py-5`}
                    value={formData.salario_base_vef}
                    onChange={handleSalarioBsChange}
                  />
                  <div className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                    Tasa BCV aplicada: <span className="text-emerald-600">Bs. {tasaBcv}</span>
                  </div>
                </div>

                <div className="hidden md:flex absolute left-1/2 top-10 -translate-x-1/2 justify-center pointer-events-none text-slate-300 text-2xl">
                  ➔
                </div>

                <div>
                  <label className={labelClasses}>Ref. USD Indexado (calculado)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      readOnly
                      className={`${inputClasses} text-2xl font-bold py-5 pr-12 bg-slate-50 text-slate-500`}
                      value={formData.salario_usd}
                    />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔒</span>
                  </div>
                  <div className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                    Valor referencial
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'salud' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelClasses}>Tipo de Sangre</label>
                  <select
                    className={`${inputClasses} appearance-none cursor-pointer`}
                    value={formData.tipo_sangre}
                    onChange={(e) => updateField('tipo_sangre', e.target.value)}
                  >
                    <option value="">No especificado</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Alergias</label>
                  <input
                    className={inputClasses}
                    placeholder="Ej: Penicilina"
                    value={formData.alergias}
                    onChange={(e) => updateField('alergias', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelClasses}>Contacto de Emergencia</label>
                  <input
                    className={inputClasses}
                    placeholder="Nombre y apellido"
                    value={formData.contacto_emergencia_nombre}
                    onChange={(e) => updateField('contacto_emergencia_nombre', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Teléfono de Emergencia</label>
                  <input
                    className={inputClasses}
                    inputMode="tel"
                    placeholder="Ej: 0414-0000000"
                    value={formData.contacto_emergencia_telefono}
                    onChange={(e) =>
                      updateField('contacto_emergencia_telefono', e.target.value.replace(/[^0-9+\-() ]/g, ''))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'familia' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Cargas Familiares</h3>
                <button
                  type="button"
                  onClick={() =>
                    setFamily((prev) => [
                      ...prev,
                      {
                        nombre_completo: '',
                        parentesco: 'Hijo',
                        fecha_nacimiento: '',
                        es_menor: true,
                      },
                    ])
                  }
                  className="text-[10px] bg-emerald-600 text-white px-5 py-2.5 rounded-full font-black uppercase tracking-widest"
                >
                  + Agregar
                </button>
              </div>

              {family.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">
                  No hay cargas familiares registradas.
                </div>
              )}

              <div className="space-y-4">
                {family.map((member, idx) => (
                  <div
                    key={idx}
                    className="p-6 bg-white border border-slate-100 rounded-3xl grid grid-cols-1 md:grid-cols-4 gap-4 items-end shadow-sm"
                  >
                    <div className="col-span-1">
                      <label className={labelClasses}>Nombre *</label>
                      <input
                        className={`${inputClasses} py-3 text-xs`}
                        value={member.nombre_completo}
                        onChange={(e) => updateFamilyMember(idx, 'nombre_completo', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Parentesco</label>
                      <select
                        className={`${inputClasses} py-3 text-xs`}
                        value={member.parentesco}
                        onChange={(e) => updateFamilyMember(idx, 'parentesco', e.target.value as CargaFamiliar['parentesco'])}
                      >
                        <option value="Hijo">Hijo</option>
                        <option value="Hija">Hija</option>
                        <option value="Cónyuge">Cónyuge</option>
                        <option value="Padre">Padre</option>
                        <option value="Madre">Madre</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClasses}>Nacimiento *</label>
                      <input
                        type="date"
                        className={`${inputClasses} py-3 text-xs`}
                        value={member.fecha_nacimiento}
                        onChange={(e) => updateFamilyMember(idx, 'fecha_nacimiento', e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFamily((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-rose-500 font-black text-[10px] uppercase pb-4"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-12 pt-8 border-t border-slate-100">
            {formError && (
              <div className="mb-5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-3 text-sm font-semibold">
                {formError}
              </div>
            )}
            <div className="flex items-center justify-between gap-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-5 text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || uploadingFiles}
                className="bg-[#1E1E2D] px-14 py-5 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-full shadow-2xl hover:bg-black transition-all flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading || uploadingFiles ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                ) : (
                  <span>✓ Guardar Expediente</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeModal;
