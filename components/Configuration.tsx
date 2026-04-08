
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ConfigGlobal } from '../types';
import { fetchBcvRate } from '../services/payrollService';

interface ConfigurationProps {
  config: ConfigGlobal | null;
  onUpdate: () => void;
}

const Configuration: React.FC<ConfigurationProps> = ({ config, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [fetchingBcv, setFetchingBcv] = useState(false);
  const [formData, setFormData] = useState<Partial<ConfigGlobal>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  const handleFetchBcv = async () => {
    setFetchingBcv(true);
    try {
      const rate = await fetchBcvRate();
      if (rate > 0) {
        setFormData(prev => ({ ...prev, tasa_bcv: rate }));
        setSuccessMessage(`Tasa BCV obtenida: Bs. ${rate}`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        alert('No se pudo obtener la tasa en este momento. Intente más tarde.');
      }
    } catch (error) {
      console.error('Error fetching BCV:', error);
      alert('No se pudo obtener la tasa automáticamente');
    } finally {
      setFetchingBcv(false);
    }
  };

  const handleSave = async () => {
    if (!config?.id) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('configuracion_global')
        .update({
          tasa_bcv: formData.tasa_bcv,
          cestaticket_usd: formData.cestaticket_usd,
          salario_minimo_vef: formData.salario_minimo_vef,
          dias_utilidades: formData.dias_utilidades,
          dias_bono_vacacional_base: formData.dias_bono_vacacional_base,
          receipt_print_config: formData.receipt_print_config || config.receipt_print_config,
          prorrateo_config: formData.prorrateo_config || config.prorrateo_config,
          theme: formData.theme || 'light',
          accent_color: formData.accent_color || 'green',
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (error) throw error;
      
      setSuccessMessage('Configuración actualizada correctamente');
      onUpdate();
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error updating config:', err);
      alert('Error al guardar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const renderTabs = () => (
    <div className="flex space-x-1 bg-slate-100 p-1 rounded-2xl mb-8">
      {[
        { id: 'general', label: 'General', pending: false },
        { id: 'apariencia', label: 'Apariencia', pending: false },
        { id: 'nomina', label: 'Nómina & Beneficios', pending: false },
        { id: 'empresa', label: 'Empresa', pending: true },
        { id: 'seguridad', label: 'Seguridad', pending: true }
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-200 relative ${
            activeTab === tab.id
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
          }`}
        >
          {tab.label}
          {tab.pending && (
            <span className="absolute -top-1 -right-1 bg-slate-400 text-white text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full leading-none">
              Pronto
            </span>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Configuración del Sistema</h2>
          {successMessage && (
            <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold animate-pulse">
              {successMessage}
            </div>
          )}
        </div>

        {renderTabs()}

        <div className="space-y-8">
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-right-4 duration-300">
              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-emerald-200 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Tasa BCV (Oficial)</label>
                    <button 
                      onClick={handleFetchBcv}
                      disabled={fetchingBcv}
                      className={`p-2 bg-emerald-100 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm flex items-center gap-1 text-[8px] font-black uppercase tracking-wider ${fetchingBcv ? 'animate-pulse' : 'hover:scale-105 active:scale-95'}`}
                      title="Obtener tasa automáticamente de ve.dolarapi.com"
                    >
                        <svg className={`w-4 h-4 ${fetchingBcv ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {fetchingBcv ? 'Consultando...' : 'Auto-Consultar'}
                    </button>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Bs.</span>
                  <input
                    type="number"
                    step="0.0001"
                    name="tasa_bcv"
                    value={formData.tasa_bcv || ''}
                    onChange={handleChange}
                    className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 bg-white text-xl font-black text-slate-800 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500 font-medium leading-relaxed">
                    Valor utilizado para todos los cálculos de nómina en Bolívares. Actualice diariamente según el Banco Central de Venezuela.
                </p>
              </div>

              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-emerald-200 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Moneda Principal</label>
                    <div className="p-2 bg-slate-200 text-slate-500 rounded-lg group-hover:bg-slate-800 group-hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                </div>
                <select className="w-full p-4 rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all cursor-not-allowed opacity-75" disabled>
                    <option>USD ($) - Dólar Americano</option>
                </select>
                <p className="mt-3 text-xs text-slate-500 font-medium leading-relaxed">
                    El sistema utiliza el Dólar como moneda base para preservar el valor de los salarios.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'apariencia' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                  <span>🎨</span> Tema Visual
                </h3>
                <div className="grid grid-cols-2 gap-4 max-w-lg">
                  <button
                    onClick={() => setFormData({ ...formData, theme: 'light' })}
                    className={`p-4 rounded-xl border-2 font-bold transition-all ${
                      (formData.theme || 'light') === 'light'
                        ? 'border-slate-800 bg-white text-slate-800 shadow-md'
                        : 'border-slate-200 bg-transparent text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    ☀️ Modo Claro
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, theme: 'dark' })}
                    className={`p-4 rounded-xl border-2 font-bold transition-all ${
                      formData.theme === 'dark'
                        ? 'border-slate-800 bg-slate-900 text-white shadow-md'
                        : 'border-slate-200 bg-transparent text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    🌙 Modo Oscuro
                  </button>
                </div>
              </div>

              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                  <span>✨</span> Color Secundario (Acento)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { id: 'light-blue', label: 'Azul Claro', bg: 'bg-sky-500', hover: 'hover:ring-sky-500' },
                    { id: 'dark-blue', label: 'Azul Oscuro', bg: 'bg-blue-700', hover: 'hover:ring-blue-700' },
                    { id: 'apple-green', label: 'Verde Manzana', bg: 'bg-lime-500', hover: 'hover:ring-lime-500' },
                    { id: 'orange', label: 'Naranja', bg: 'bg-orange-500', hover: 'hover:ring-orange-500' },
                  ].map((color) => (
                    <button
                      key={color.id}
                      onClick={() => setFormData({ ...formData, accent_color: color.id })}
                      className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        (formData.accent_color || 'green') === color.id
                          ? 'border-slate-800 bg-white shadow-md'
                          : `border-slate-200 bg-transparent hover:border-slate-300`
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full ${color.bg} shadow-inner`}></div>
                      <span className={`text-xs font-bold ${
                        (formData.accent_color || 'green') === color.id ? 'text-slate-800' : 'text-slate-500'
                      }`}>
                        {color.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                  El color se aplicará en botones, íconos y elementos destacados.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'nomina' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-2">Cestaticket Base ($)</label>
                        <input
                            type="number"
                            name="cestaticket_usd"
                            value={formData.cestaticket_usd || ''}
                            onChange={handleChange}
                            className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold text-slate-700"
                        />
                        <p className="text-[10px] text-slate-400 mt-2">Valor mensual en dólares anclado al BCV.</p>
                    </div>

                    <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-2">Salario Mínimo (Bs.)</label>
                        <input
                            type="number"
                            name="salario_minimo_vef"
                            value={formData.salario_minimo_vef || ''}
                            onChange={handleChange}
                            className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold text-slate-700"
                        />
                        <p className="text-[10px] text-slate-400 mt-2">Base mínima legal vigente en Bolívares.</p>
                    </div>
                    
                    <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-2">Días de Utilidades</label>
                        <input
                            type="number"
                            name="dias_utilidades"
                            value={formData.dias_utilidades || ''}
                            onChange={handleChange}
                            className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold text-slate-700"
                        />
                        <p className="text-[10px] text-slate-400 mt-2">Días a pagar por concepto de utilidades anuales.</p>
                    </div>

                    <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-2">Bono Vacacional Base (Días)</label>
                        <input
                            type="number"
                            name="dias_bono_vacacional_base"
                            value={formData.dias_bono_vacacional_base || ''}
                            onChange={handleChange}
                            className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold text-slate-700"
                        />
                         <p className="text-[10px] text-slate-400 mt-2">Días base + 1 día adicional por año de servicio.</p>
                    </div>
                </div>
            </div>
          )}

          {activeTab === 'empresa' && (
            <div className="bg-slate-50 p-10 rounded-[2rem] text-center border border-dashed border-slate-200 animate-in slide-in-from-right-4 duration-300">
              <div className="w-20 h-20 bg-slate-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <span className="inline-block bg-slate-200 text-slate-500 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3">En desarrollo</span>
              <h3 className="text-lg font-bold text-slate-700 mb-2">Perfil de la Organización</h3>
              <p className="text-slate-400 max-w-sm mx-auto text-sm leading-relaxed">
                Aquí podrás configurar el logo, razón social, dirección fiscal y datos legales de la empresa matriz. Esta función estará disponible en una próxima actualización.
              </p>
            </div>
          )}

          {activeTab === 'seguridad' && (
            <div className="bg-rose-50 p-10 rounded-[2rem] text-center border border-dashed border-rose-100 animate-in slide-in-from-right-4 duration-300">
              <div className="w-20 h-20 bg-rose-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-10 h-10 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <span className="inline-block bg-rose-100 text-rose-500 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3">En desarrollo</span>
              <h3 className="text-lg font-bold text-slate-700 mb-2">Centro de Seguridad</h3>
              <p className="text-slate-400 max-w-sm mx-auto text-sm leading-relaxed">
                La gestión de contraseñas, doble factor de autenticación y sesiones activas estará disponible en una próxima versión del sistema.
              </p>
            </div>
          )}

          {/* Guardar solo en tabs con contenido editable */}
          {['general', 'apariencia', 'nomina'].includes(activeTab) && (
            <div className="flex justify-end pt-8 border-t border-slate-100 mt-8">
              <button
                onClick={handleSave}
                disabled={loading}
                className={`px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all active:scale-95 ${
                  loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                }`}
              >
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Configuration;
