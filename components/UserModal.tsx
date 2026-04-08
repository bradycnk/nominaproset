
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EditUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  editUser?: EditUser | null;
}

const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, editUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('employee');
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const isEditing = !!editUser;

  useEffect(() => {
    if (isOpen) {
      fetchRoles();
      if (editUser) {
        setEmail(editUser.email);
        setFullName(editUser.fullName);
        setRole(editUser.role);
        setPassword('');
      } else {
        setEmail('');
        setPassword('');
        setFullName('');
        setRole('employee');
      }
    }
  }, [isOpen, editUser]);

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase.from('roles').select('*');
      if (error) throw error;
      setRoles(data || []);
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEditing) {
        const { data, error } = await supabase.functions.invoke('update-user', {
          body: { userId: editUser!.id, role, fullName },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else {
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: { email, password, role, fullName },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      onClose();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300 relative">
        <button onClick={onClose} className="absolute top-6 right-8 text-slate-400 hover:text-slate-600">✕</button>

        <div className="mb-8">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">
            {isEditing ? 'Editar Usuario' : 'Registrar Nuevo Usuario'}
          </h3>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">
            {isEditing ? 'Modificar datos del usuario' : 'Crear una nueva cuenta de usuario'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Nombre completo</label>
            <input
              type="text"
              placeholder="Nombre del usuario"
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Email</label>
            <input
              type="email"
              required
              disabled={isEditing}
              placeholder="correo@empresa.com"
              className={`w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          {!isEditing && (
            <div>
              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Contraseña</label>
              <input
                type="password"
                required
                placeholder="********"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2 block">Rol</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              {roles.map(r => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] bg-[#1E1E2D] text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all disabled:opacity-50"
            >
              {saving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Confirmar Registro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserModal;
