import React, { useState } from 'react';
import { supabase } from '../lib/supabase.ts';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        alert('Registro exitoso. Verifica tu correo si es necesario o intenta iniciar sesion.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrio un error en la autenticacion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="rounded-[2rem] bg-slate-950 px-6 py-8 text-white shadow-2xl sm:px-8 sm:py-10">
          <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-3xl shadow-lg shadow-emerald-500/20">
            +
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-400">FarmaNomina Pro</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Nomina, asistencia y control diario en una sola vista.</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
            Entra al panel para revisar empleados, cierres quincenales y la operacion diaria sin perder contexto.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Asistencia</p>
              <p className="mt-2 text-sm font-semibold text-white">Control diario y calendario editable.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Nomina</p>
              <p className="mt-2 text-sm font-semibold text-white">Cierres, calculos LOTTT y seguimiento.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Admin</p>
              <p className="mt-2 text-sm font-semibold text-white">Panel claro para sucursales y usuarios.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200 sm:p-8">
          <h2 className="text-center text-2xl font-black tracking-tight text-slate-800">
            {isSignUp ? 'Crear cuenta administrativa' : 'Iniciar sesion'}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            Accede con tu correo para entrar al panel principal.
          </p>

          {error && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} className="mt-6 space-y-4">
            {isSignUp && (
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Nombre completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Perez"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Correo electronico</label>
              <input
                type="email"
                required
                placeholder="admin@farmacia.com"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Contrasena</label>
              <input
                type="password"
                required
                placeholder="********"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Procesando...' : isSignUp ? 'Registrarse' : 'Entrar al sistema'}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
            >
              {isSignUp ? 'Ya tienes cuenta? Inicia sesion' : 'No tienes cuenta? Registrate'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Auth;
