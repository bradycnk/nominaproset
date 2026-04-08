
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { Empleado, ConfigGlobal } from '../types.ts';
import EmployeeModal from './EmployeeModal.tsx';
import EmployeeProfile from './EmployeeProfile.tsx';

interface EmployeeTableProps {
  config: ConfigGlobal | null;
}

const EmployeeTable: React.FC<EmployeeTableProps> = ({ config }) => {
  const [employees, setEmployees] = useState<Empleado[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Empleado | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchEmployees();
    fetchBranches();

    const channel = supabase
      .channel('schema-db-changes-employees')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empleados' },
        () => {
          fetchEmployees();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase.from('sucursales').select('id, nombre_id').order('nombre_id');
      if (error) throw error;
      setBranches(data || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('empleados')
        .select('*, sucursales(nombre_id)')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddClick = () => {
    setSelectedEmployee(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (emp: Empleado) => {
    setSelectedEmployee(emp);
    setIsModalOpen(true);
  };
  
  const handleNameClick = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
  };

  const handleBackToList = () => {
    setSelectedEmployeeId(null);
  };

  const handleDeleteClick = async (id: string, nombre: string, apellido: string) => {
    if (window.confirm(`¿Está seguro de que desea eliminar permanentemente al empleado ${nombre} ${apellido}? Esta acción eliminará todo su historial (nóminas, asistencias, adelantos) de forma irreversible.`)) {
      try {
        const { error } = await supabase.from('empleados').delete().eq('id', id);
        if (error) throw error;
        setEmployees(prev => prev.filter(emp => emp.id !== id));
      } catch (error: any) {
        console.error('Error al eliminar empleado:', error);
        alert(`Hubo un error al intentar eliminar el empleado: ${error.message || 'Error desconocido'}`);
      }
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = (emp.nombre.toLowerCase() + ' ' + emp.apellido.toLowerCase()).includes(searchTerm.toLowerCase()) ||
                          emp.cedula.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.cargo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch = selectedBranchId ? emp.sucursal_id === selectedBranchId : true;
    return matchesSearch && matchesBranch;
  });
  
  if (selectedEmployeeId) {
    return <EmployeeProfile employeeId={selectedEmployeeId} onBack={handleBackToList} config={config} />;
  }

  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Nómina de Empleados</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Total registrados: {filteredEmployees.length}</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            className="bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-sm cursor-pointer min-w-[180px]"
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
          >
            <option value="">Todas las sucursales</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.nombre_id}</option>
            ))}
          </select>
          <input 
            type="text"
            placeholder="Buscar empleado..."
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <button 
            onClick={handleAddClick}
            className="bg-[#10b981] hover:bg-emerald-600 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-100 transform active:scale-95 flex items-center gap-2"
          >
            <span className="text-base">+</span> Agregar Empleado
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-[#F8F9FB] text-slate-400 text-[10px] font-black uppercase tracking-[0.15em] border-b border-slate-50">
            <tr>
              <th className="px-8 py-5 text-center w-20">Foto</th>
              <th className="px-8 py-5">Empleado / Sede</th>
              <th className="px-8 py-5">Cédula / RIF</th>
              <th className="px-8 py-5">Cargo</th>
              <th className="px-8 py-5 text-right">Salario (USD/BS)</th>
              <th className="px-8 py-5">Estatus</th>
              <th className="px-8 py-5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent animate-spin rounded-full"></div>
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Sincronizando nómina...</span>
                  </div>
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-8 py-20 text-center">
                  <div className="text-slate-200 text-5xl mb-4">📂</div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No hay trabajadores en el sistema</p>
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-emerald-50/50 transition-all duration-300 group border-b border-slate-100 last:border-0 hover:shadow-md hover:z-10 relative">
                  <td className="px-8 py-6">
                    <div className="w-14 h-14 rounded-full bg-slate-100 border-2 border-white shadow-md flex items-center justify-center overflow-hidden transition-transform group-hover:scale-110">
                      {emp.foto_url ? (
                        <img
                          src={emp.foto_url}
                          alt={`${emp.nombre}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.querySelector('.avatar-fallback')?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`avatar-fallback flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-emerald-400 to-teal-600 ${emp.foto_url ? 'hidden' : ''}`}>
                        <svg className="w-8 h-8 text-white/90" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z"/>
                        </svg>
                        <span className="text-[8px] font-bold text-white/80 mt-0.5 uppercase">{emp.nombre[0]}{emp.apellido[0]}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 cursor-pointer" onClick={() => handleNameClick(emp.id)}>
                    <div>
                      <div className="font-black text-slate-800 text-sm uppercase leading-tight">{emp.nombre} {emp.apellido}</div>
                      <div className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter mt-1 flex items-center gap-1">
                        <span className="text-rose-400">📍</span> {emp.sucursales?.nombre_id || 'Sin Sede Asignada'}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-slate-600 font-bold font-mono text-xs">{emp.cedula || '---'}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">{emp.rif || 'Sin RIF'}</div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-200">
                      {emp.cargo || 'General'}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="font-bold text-emerald-600 text-base leading-none">
                      ${Number(emp.salario_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold mt-1 tracking-tighter">
                      Bs. {Number(emp.salario_base_vef || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black tracking-[0.1em] uppercase ${
                      emp.activo ? 'bg-emerald-100/50 text-emerald-600' : 'bg-rose-100 text-rose-600'
                    }`}>
                      {emp.activo ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className="flex justify-center gap-1">
                      <button 
                        onClick={() => handleEditClick(emp)}
                        className="p-2.5 hover:bg-slate-100 text-slate-300 hover:text-amber-500 rounded-xl transition-all"
                        title="Editar Expediente"
                      >
                        <span className="text-lg">✏️</span>
                      </button>
                      {emp.cv_url && (
                        <a 
                          href={emp.cv_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="p-2.5 hover:bg-slate-100 text-slate-300 hover:text-sky-500 rounded-xl transition-all" 
                          title="Ver Curriculum"
                        >
                          <span className="text-lg">📄</span>
                        </a>
                      )}
                      <button 
                        onClick={() => handleDeleteClick(emp.id, emp.nombre, emp.apellido)}
                        className="p-2.5 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-xl transition-all"
                        title="Eliminar Permanentemente"
                      >
                        <span className="text-lg">🗑️</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="p-6 bg-[#F8F9FB] border-t border-slate-50 flex justify-center">
         <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Gestión de Nómina Indexada - LOTTT 2024</p>
      </div>

      <EmployeeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        employeeToEdit={selectedEmployee}
        config={config}
      />
    </div>
  );
};

export default EmployeeTable;
