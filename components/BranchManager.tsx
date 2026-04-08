
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.ts';
import { Sucursal } from '../types.ts';

const BranchManager: React.FC = () => {
  const [branches, setBranches] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingBranch, setEditingBranch] = useState<Sucursal | null>(null);
  
  // Form Data
  const [formData, setFormData] = useState({
    nombre_id: '',
    rif: '',
    direccion: '',
    administrador: '',
    correo_admin: '',
    es_principal: false,
    logo_url: ''
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sucursales')
        .select('*')
        .order('nombre_id', { ascending: true });

      if (error) throw error;
      setBranches(data || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (branch: Sucursal | null) => {
    if (branch) {
      setFormData(branch);
      setLogoPreview(branch.logo_url);
      setEditingBranch(branch);
    } else {
      setFormData({
        nombre_id: '',
        rif: '',
        direccion: '',
        administrador: '',
        correo_admin: '',
        es_principal: false,
        logo_url: ''
      });
      setLogoPreview(null);
      setEditingBranch(null);
    }
    setShowModal(true);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      let finalLogoUrl = formData.logo_url;
      const file = fileInputRef.current?.files?.[0];

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `logos/logo_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('expedientes')
          .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('expedientes')
          .getPublicUrl(fileName);
          
        finalLogoUrl = publicUrl;
      }

      const payload = {
        ...formData,
        logo_url: finalLogoUrl
      };

      let newBranchId = editingBranch?.id;

      if (editingBranch) {
        const { error } = await supabase.from('sucursales').update(payload).eq('id', editingBranch.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('sucursales').insert([payload]).select().single();
        if (error) throw error;
        newBranchId = data.id;
      }

      if (formData.es_principal && newBranchId) {
        const { error: updateError } = await supabase
          .from('sucursales')
          .update({ es_principal: false })
          .neq('id', newBranchId);
        if (updateError) {
          console.error("No se pudieron desmarcar las otras sucursales principales:", updateError);
        }
      }

      setShowModal(false);
      fetchBranches();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (branchId: number) => {
    if (window.confirm('¿Está seguro de que desea eliminar esta sucursal?')) {
      try {
        const { error } = await supabase.from('sucursales').delete().eq('id', branchId);
        if (error) throw error;
        fetchBranches();
      } catch (err: any) {
        alert('Error: ' + err.message);
      }
    }
  };

  const filteredBranches = branches.filter(branch =>
    branch.nombre_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    branch.rif.toLowerCase().includes(searchTerm.toLowerCase()) ||
    branch.administrador.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gestión de Sucursales</h2>
          <p className="text-sm text-slate-500 font-medium">Administre las sedes físicas de la farmacia</p>
        </div>
        <div className="flex items-center gap-4">
          <input 
            type="text"
            placeholder="Buscar sucursal..."
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <button 
            onClick={() => handleOpenModal(null)}
            className="bg-[#10b981] hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-50 active:scale-95"
          >
            + Agregar Sucursal
          </button>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="p-20 text-center text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent animate-spin rounded-full"></div>
              <span className="text-[10px] font-black uppercase tracking-widest">Sincronizando sedes...</span>
            </div>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="p-20 text-center">
            <div className="text-4xl mb-4 opacity-20">🏢</div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No hay sucursales registradas en el sistema</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBranches.map(branch => (
              <div key={branch.id} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all flex flex-col gap-4 group">

                {/* Header: logo + nombre + badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 text-xl border border-emerald-100 shadow-sm flex-shrink-0 transition-transform group-hover:scale-110">
                      {branch.logo_url ? (
                        <img src={branch.logo_url} className="w-full h-full object-cover rounded-2xl" alt="logo" />
                      ) : (
                        <span>🏢</span>
                      )}
                    </div>
                    <div>
                      <p className="font-black uppercase text-slate-800 text-sm leading-tight tracking-tight">{branch.nombre_id}</p>
                      <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter mt-1">ID: {branch.id.split('-')[0]}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase border flex-shrink-0 ${
                    branch.es_principal
                      ? 'bg-emerald-100/50 text-emerald-600 border-emerald-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}>
                    {branch.es_principal ? 'PRINCIPAL' : 'SUCURSAL'}
                  </span>
                </div>

                {/* Datos */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex gap-3">
                    <span className="text-slate-400 font-bold w-16 flex-shrink-0">RIF</span>
                    <span className="font-mono font-bold text-slate-600">{branch.rif}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-slate-400 font-bold w-16 flex-shrink-0">Dirección</span>
                    <span className="text-slate-600 font-medium leading-relaxed">{branch.direccion}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-slate-400 font-bold w-16 flex-shrink-0">Admin</span>
                    <div>
                      <p className="font-bold text-slate-700 uppercase">{branch.administrador}</p>
                      <p className="text-slate-400">{branch.correo_admin}</p>
                    </div>
                  </div>
                </div>

                {/* Botones con etiqueta */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenModal(branch)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-amber-50 hover:text-amber-600 border border-transparent hover:border-amber-200 rounded-xl text-[10px] font-bold text-slate-600 transition-all"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => handleDelete(branch.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-200 rounded-xl text-[10px] font-bold text-slate-600 transition-all"
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="p-6 bg-[#F8F9FB] border-t border-slate-50 flex justify-center">
         <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Gestión de Sedes Farmacéuticas • LOTTT v2.4</p>
      </div>
      
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-4xl w-full shadow-2xl animate-in zoom-in-95 duration-300 relative">
             <button onClick={() => setShowModal(false)} className="absolute top-6 right-8 text-slate-400 hover:text-slate-600">✕</button>
             
             <div className="mb-8">
               <h3 className="text-2xl font-black text-slate-800 tracking-tight">{editingBranch ? 'Editar Sede' : 'Registrar Nueva Sede'}</h3>
               <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">Configuración Fiscal de la Entidad</p>
             </div>

             <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-10">
               {/* Left: Logo */}
               <div className="w-full md:w-1/3 flex flex-col items-center">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-square bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 hover:border-emerald-400 cursor-pointer flex items-center justify-center relative overflow-hidden group transition-all"
                  >
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain p-4" />
                    ) : (
                      <div className="text-center">
                        <span className="text-4xl block mb-2">🏢</span>
                        <span className="text-[10px] font-black text-slate-300 uppercase">Sin Logo</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                      Cambiar Logo
                    </div>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLogoChange} />
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 bg-[#1E293B] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest w-full hover:bg-black transition-all"
                  >
                    📷 Cambiar Logo Principal
                  </button>
               </div>

               {/* Right: Inputs */}
               <div className="flex-1 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Nombre Comercial</label>
                      <input 
                        type="text" 
                        required
                        placeholder="Farma Salud Principal"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                        value={formData.nombre_id}
                        onChange={e => setFormData({...formData, nombre_id: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">RIF Patronal</label>
                      <input 
                        type="text" 
                        required
                        placeholder="J-00000000-0"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                        value={formData.rif}
                        onChange={e => setFormData({...formData, rif: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Dirección Fiscal Completa</label>
                    <textarea 
                      required
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium h-24 resize-none"
                      value={formData.direccion}
                      onChange={e => setFormData({...formData, direccion: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Administrador</label>
                      <input 
                        type="text" 
                        required
                        placeholder="Nombre del Regente"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                        value={formData.administrador}
                        onChange={e => setFormData({...formData, administrador: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Email Admin</label>
                      <input 
                        type="email" 
                        required
                        placeholder="correo@empresa.com"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                        value={formData.correo_admin}
                        onChange={e => setFormData({...formData, correo_admin: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                        checked={formData.es_principal}
                        onChange={e => setFormData({...formData, es_principal: e.target.checked})}
                      />
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wide">Marcar como Sede Principal (Dirección Fiscal Principal)</span>
                    </label>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button" 
                      onClick={() => setShowModal(false)}
                      className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                    >
                      Descartar
                    </button>
                    <button 
                      type="submit" 
                      disabled={uploading}
                      className="flex-[2] bg-[#1E1E2D] text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {uploading ? 'Guardando...' : (editingBranch ? 'Actualizar Sede' : 'Confirmar Registro')}
                    </button>
                  </div>
               </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchManager;
