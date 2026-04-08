
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Empleado, ConfigGlobal } from '../types';

interface SocialBenefitsManagerProps {
  config: ConfigGlobal | null;
}

interface BenefitSummary {
  empleado: Empleado;
  totalVef: number;
  totalUsd: number;
  diasTotales: number;
  interesesVef: number;
}

const SocialBenefitsManager: React.FC<SocialBenefitsManagerProps> = ({ config }) => {
  const [summaries, setSummaries] = useState<BenefitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Empleado | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummaries();
  }, []);

  const fetchSummaries = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: employees, error: empError } = await supabase.from('empleados').select('*').eq('activo', true);
      if (empError) throw empError;
      const { data: benefits, error: benError } = await supabase.from('historial_prestaciones').select('*');
      if (benError) throw benError;

      if (employees) {
        const calculatedSummaries = employees.map(emp => {
          const empBenefits = benefits?.filter(b => b.empleado_id === emp.id) || [];

          const totalVef = empBenefits.reduce((sum, b) => sum + Number(b.monto_vef), 0);
          const totalUsd = empBenefits.reduce((sum, b) => sum + Number(b.monto_usd), 0);
          const diasTotales = empBenefits.reduce((sum, b) => sum + (b.dias || 0), 0);
          const interesesVef = empBenefits.filter(b => b.tipo === 'interes').reduce((sum, b) => sum + Number(b.monto_vef), 0);

          return {
            empleado: emp,
            totalVef,
            totalUsd,
            diasTotales,
            interesesVef
          };
        });
        setSummaries(calculatedSummaries);
      }
    } catch (err) {
      console.error("Error fetching benefits:", err);
      setError("Error al cargar las prestaciones sociales. Por favor, intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (empId: string) => {
    setHistoryError(null);
    try {
      const { data, error: histError } = await supabase
        .from('historial_prestaciones')
        .select('*')
        .eq('empleado_id', empId)
        .order('anio', { ascending: false })
        .order('trimestre', { ascending: false })
        .order('mes', { ascending: false });
      if (histError) throw histError;
      setHistory(data || []);
    } catch (err) {
      console.error("Error fetching history:", err);
      setHistoryError("Error al cargar el historial de este empleado.");
    }
  };

  const handleViewDetails = (summary: BenefitSummary) => {
    setSelectedEmployee(summary.empleado);
    fetchHistory(summary.empleado.id);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Garantía de Prestaciones Sociales</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Artículo 142 LOTTT - Control de Acumulados</p>
          </div>
          <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Tasa BCV Aplicada</span>
            <span className="text-lg font-black text-emerald-700">Bs. {config?.tasa_bcv}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Días Acum.</th>
                <th className="px-6 py-4">Total Garantía (Bs.)</th>
                <th className="px-6 py-4">Equiv. (USD)</th>
                <th className="px-6 py-4">Intereses (Bs.)</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">Cargando datos...</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="text-center py-10 text-red-500 font-semibold">{error}</td></tr>
              ) : summaries.map((s) => (
                <tr key={s.empleado.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-700">{s.empleado.nombre} {s.empleado.apellido}</div>
                    <div className="text-[10px] text-slate-400 font-medium">Ingreso: {new Date(s.empleado.fecha_ingreso).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[11px] font-black">
                      {s.diasTotales} días
                    </span>
                  </td>
                  <td className="px-6 py-4 font-black text-slate-800">
                    Bs. {s.totalVef.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-emerald-600 font-bold">${s.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </td>
                  <td className="px-6 py-4 text-rose-500 font-bold">
                    Bs. {s.interesesVef.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => handleViewDetails(s)}
                      className="text-[10px] font-black uppercase tracking-widest bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-all"
                    >
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEmployee && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-slate-800">Historial: {selectedEmployee.nombre} {selectedEmployee.apellido}</h3>
            <button onClick={() => setSelectedEmployee(null)} className="text-slate-400 hover:text-slate-600 font-black text-xs uppercase">Cerrar</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Garantía Trimestral</span>
              <p className="text-xl font-black text-slate-800">
                Bs. {history.filter(h => h.tipo === 'trimestral').reduce((sum, h) => sum + Number(h.monto_vef), 0).toLocaleString('es-VE')}
              </p>
            </div>
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Días Adicionales</span>
              <p className="text-xl font-black text-slate-800">
                {history.filter(h => h.tipo === 'adicional').reduce((sum, h) => sum + h.dias, 0)} días
              </p>
            </div>
            <div className="p-6 bg-emerald-600 rounded-3xl shadow-lg shadow-emerald-900/10 text-white">
              <span className="text-[10px] font-black text-white/70 uppercase block mb-1">Total Acumulado</span>
              <p className="text-xl font-black">
                Bs. {history.reduce((sum, h) => sum + Number(h.monto_vef), 0).toLocaleString('es-VE')}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-3">Periodo</th>
                  <th className="px-6 py-3">Concepto</th>
                  <th className="px-6 py-3">Días</th>
                  <th className="px-6 py-3">Sueldo Integral</th>
                  <th className="px-6 py-3 text-right">Monto (Bs.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {historyError ? (
                  <tr><td colSpan={5} className="text-center py-6 text-red-500 font-semibold">{historyError}</td></tr>
                ) : history.map((h, i) => (
                  <tr key={i} className="text-sm">
                    <td className="px-6 py-4 font-bold text-slate-600">
                      {h.trimestre ? `T${h.trimestre} - ${h.anio}` : `${h.mes}/${h.anio}`}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`capitalize px-2 py-1 rounded text-[10px] font-bold ${
                        h.tipo === 'trimestral' ? 'bg-blue-100 text-blue-700' :
                        h.tipo === 'adicional' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {h.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium">{h.dias || '-'}</td>
                    <td className="px-6 py-4 text-slate-500">Bs. {Number(h.salario_integral_diario_vef).toLocaleString('es-VE')}</td>
                    <td className="px-6 py-4 text-right font-black text-slate-800">Bs. {Number(h.monto_vef).toLocaleString('es-VE')}</td>
                  </tr>
                ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialBenefitsManager;
