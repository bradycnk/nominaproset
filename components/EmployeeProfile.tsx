
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Empleado, ConfigGlobal } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EmployeeProfileProps {
  employeeId: string;
  onBack: () => void;
  config: ConfigGlobal | null;
}

const EmployeeProfile: React.FC<EmployeeProfileProps> = ({ employeeId, onBack, config }) => {
  const [employee, setEmployee] = useState<Empleado | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployee();
  }, [employeeId]);

  const fetchEmployee = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('empleados')
        .select('*, sucursales(nombre_id, direccion)')
        .eq('id', employeeId)
        .single();

      if (error) throw error;
      setEmployee(data || null);
    } catch (error) {
      console.error('Error fetching employee:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    if (!employee) return;

    const doc = new jsPDF();
    const primaryColor = [16, 185, 129]; // Emerald 500

    // Header
    doc.setFontSize(22);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Hoja de Vida del Empleado', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Generado el: ${new Date().toLocaleDateString('es-VE')}`, 105, 30, { align: 'center' });

    let yPos = 40;

    // Helper to add section title
    const addSectionTitle = (title: string, y: number) => {
      doc.setFontSize(14);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), 14, y);
      doc.setDrawColor(200);
      doc.line(14, y + 2, 196, y + 2);
      return y + 10;
    };

    // 1. Información General
    yPos = addSectionTitle('1. Información General', yPos);
    
    const generalData = [
      ['Nombre Completo', `${employee.nombre} ${employee.apellido}`],
      ['Cédula', employee.cedula],
      ['Cargo', employee.cargo],
      ['Sucursal', employee.sucursales?.nombre_id || 'N/A'],
      ['Dirección Habitación', employee.direccion_habitacion || 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: generalData,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });
    
    // Update yPos based on previous table
    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // 2. Datos Personales
    yPos = addSectionTitle('2. Datos Personales', yPos);

    const personalData = [
      ['RIF', employee.rif],
      ['Nacionalidad', employee.nacionalidad || 'N/A'],
      ['Sexo', employee.sexo || 'N/A'],
      ['Estado Civil', employee.estado_civil || 'N/A'],
      ['Fecha de Nacimiento', employee.fecha_nacimiento ? new Date(employee.fecha_nacimiento).toLocaleDateString('es-VE') : 'N/A'],
      ['Lugar de Nacimiento', employee.lugar_nacimiento || 'N/A'],
      ['Email Personal', employee.email_personal || 'N/A'],
      ['Teléfono Móvil', employee.telefono_movil || 'N/A'],
      ['Teléfono Fijo', employee.telefono_fijo || 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: personalData,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // Check if we need a new page
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    // 3. Perfil del Cargo
    yPos = addSectionTitle('3. Perfil del Cargo', yPos);

    const jobData = [
      ['Departamento', employee.departamento || 'N/A'],
      ['Tipo de Contrato', employee.tipo_contrato || 'N/A'],
      ['Tipo de Jornada', employee.tipo_jornada || 'N/A'],
      ['Fecha de Ingreso', new Date(employee.fecha_ingreso).toLocaleDateString('es-VE')],
      ['Salario USD', `$${Number(employee.salario_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
      ['Estatus', employee.activo ? 'Activo' : 'Inactivo'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: jobData,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // 4. Información de Salud y Emergencias
    yPos = addSectionTitle('4. Información de Salud y Emergencias', yPos);

    const healthData = [
      ['Contacto de Emergencia', employee.contacto_emergencia_nombre || 'N/A'],
      ['Teléfono de Emergencia', employee.contacto_emergencia_telefono || 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: healthData,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });

    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent animate-spin rounded-full"></div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-20 text-center">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Empleado no encontrado</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 max-w-5xl mx-auto">
      <div className="flex items-center mb-8">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 flex items-center gap-2 transition-colors">
          <span>←</span> Volver a la lista
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start mb-10 border-b border-slate-100 pb-10">
        <div className="w-40 h-40 rounded-full bg-slate-100 border-4 border-white shadow-xl flex items-center justify-center overflow-hidden flex-shrink-0 mx-auto md:mx-0">
          {employee.foto_url ? (
            <img src={employee.foto_url} alt={`${employee.nombre}`} className="w-full h-full object-cover" onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.querySelector('.avatar-fallback')?.classList.remove('hidden');
            }} />
          ) : null}
          <div className={`avatar-fallback flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-emerald-400 to-teal-600 ${employee.foto_url ? 'hidden' : ''}`}>
            <svg className="w-20 h-20 text-white/90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
            <span className="text-sm font-bold text-white/80 mt-1 uppercase">{employee.nombre[0]}{employee.apellido[0]}</span>
          </div>
        </div>
        <div className="text-center md:text-left flex-1">
          <h1 className="text-4xl font-black text-slate-800 tracking-tight mb-2">{employee.nombre} {employee.apellido}</h1>
          <p className="text-emerald-600 font-bold uppercase tracking-widest text-lg mb-4">{employee.cargo}</p>
          <div className="flex flex-wrap justify-center md:justify-start gap-3">
             <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${employee.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {employee.activo ? 'Activo' : 'Inactivo'}
             </span>
             <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold uppercase">
                {employee.sucursales?.nombre_id || 'Sin Sucursal'}
             </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 1. Información General y Ubicación */}
        <section className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
          <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-6 flex items-center gap-2">
            1. Información General y Ubicación
          </h3>
          <div className="space-y-4">
            <div className="group">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dirección de Habitación</label>
                <p className="text-slate-700 font-medium">{employee.direccion_habitacion || 'No registrada'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="group">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sucursal Asignada</label>
                    <p className="text-slate-700 font-medium">{employee.sucursales?.nombre_id || 'No asignada'}</p>
                </div>
                 <div className="group">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dirección Sucursal</label>
                    <p className="text-slate-700 font-medium text-xs">{employee.sucursales?.direccion || 'N/A'}</p>
                </div>
            </div>
          </div>
        </section>

        {/* 2. Datos Personales */}
        <section className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
          <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-6 flex items-center gap-2">
            2. Datos Personales
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Cédula</label>
                <p className="text-slate-700 font-medium">{employee.cedula}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">RIF</label>
                <p className="text-slate-700 font-medium">{employee.rif}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nacionalidad</label>
                <p className="text-slate-700 font-medium">{employee.nacionalidad || 'N/A'}</p>
             </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sexo</label>
                <p className="text-slate-700 font-medium">{employee.sexo || 'N/A'}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Estado Civil</label>
                <p className="text-slate-700 font-medium">{employee.estado_civil || 'N/A'}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha Nacimiento</label>
                <p className="text-slate-700 font-medium">{employee.fecha_nacimiento ? new Date(employee.fecha_nacimiento).toLocaleDateString('es-VE') : 'N/A'}</p>
             </div>
             <div className="col-span-full">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lugar de Nacimiento</label>
                <p className="text-slate-700 font-medium">{employee.lugar_nacimiento || 'N/A'}</p>
             </div>
             <div className="col-span-full">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email Personal</label>
                <p className="text-slate-700 font-medium truncate">{employee.email_personal || 'N/A'}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Teléfono Móvil</label>
                <p className="text-slate-700 font-medium">{employee.telefono_movil || 'N/A'}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Teléfono Fijo</label>
                <p className="text-slate-700 font-medium">{employee.telefono_fijo || 'N/A'}</p>
             </div>
          </div>
        </section>

        {/* 3. Perfil del Cargo */}
        <section className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
           <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-6 flex items-center gap-2">
            3. Perfil del Cargo
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="col-span-full">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Departamento</label>
                <p className="text-slate-700 font-medium">{employee.departamento || 'N/A'}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tipo Contrato</label>
                <p className="text-slate-700 font-medium">{employee.tipo_contrato || 'N/A'}</p>
             </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Jornada</label>
                <p className="text-slate-700 font-medium">{employee.tipo_jornada || 'N/A'}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha Ingreso</label>
                <p className="text-slate-700 font-medium">{new Date(employee.fecha_ingreso).toLocaleDateString('es-VE')}</p>
             </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha Inicio Contrato</label>
                <p className="text-slate-700 font-medium">{employee.fecha_inicio_contrato ? new Date(employee.fecha_inicio_contrato).toLocaleDateString('es-VE') : 'N/A'}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Salario USD</label>
                <p className="text-slate-700 font-medium">${Number(employee.salario_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Salario Base VEF</label>
                <div className="flex items-center gap-2">
                  <p className="text-slate-700 font-medium">Bs. {Number(employee.salario_base_vef).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black rounded border border-emerald-100 uppercase">
                    Tasa: {config?.tasa_bcv}
                  </span>
                </div>
             </div>
          </div>
        </section>

        {/* 4. Información de Salud y Emergencias */}
        <section className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
          <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-6 flex items-center gap-2">
            4. Información de Salud y Emergencias
          </h3>
          <div className="space-y-4">
            <div className="p-4 bg-white rounded-xl border border-slate-100">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <span className="font-bold text-slate-700">Contacto de Emergencia</span>
                </div>
                <div className="grid grid-cols-1 gap-2 pl-11">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase">Nombre</label>
                        <p className="text-slate-800">{employee.contacto_emergencia_nombre || 'No registrado'}</p>
                    </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase">Teléfono</label>
                        <p className="text-slate-800">{employee.contacto_emergencia_telefono || 'No registrado'}</p>
                    </div>
                </div>
            </div>
            
            <div className="p-4 bg-white rounded-xl border border-slate-100 opacity-60">
                 <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <span className="font-bold text-slate-700">Ficha Médica</span>
                </div>
                <p className="text-xs text-slate-500 pl-11">Información médica detallada no disponible en este momento.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8 flex justify-center pb-8">
        <button 
          onClick={generatePDF}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 text-lg transform hover:scale-105"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Generar Planilla de Hoja de Vida (PDF)
        </button>
      </div>
    </div>
  );
};

export default EmployeeProfile;
