import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.tsx';
import EmployeeTable from './components/EmployeeTable.tsx';
import DashboardOverview from './components/DashboardOverview.tsx';
import PayrollProcessor from './components/PayrollProcessor.tsx';
import AttendanceManager from './components/AttendanceManager.tsx';
import BranchManager from './components/BranchManager.tsx';
import UserManager from './components/UserManager.tsx';
import Auth from './components/Auth.tsx';
import Configuration from './components/Configuration.tsx';
import SocialBenefitsManager from './components/SocialBenefitsManager.tsx';
import AIAssistant from './components/AIAssistant.tsx';
import ThemeEngine from './components/ThemeEngine.tsx';
import { supabase } from './lib/supabase.ts';
import { ConfigGlobal } from './types.ts';
import { fetchBcvRate } from './services/payrollService';

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  sucursales: 'Sucursales',
  empleados: 'Empleados',
  nomina: 'Nomina',
  prestaciones: 'Prestaciones',
  asistencia: 'Asistencia',
  config: 'Configuracion',
  usuarios: 'Usuarios',
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('admin');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [visitedTabs, setVisitedTabs] = useState<string[]>(['dashboard']);
  const [config, setConfig] = useState<ConfigGlobal | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [estimatedPayrollVEF, setEstimatedPayrollVEF] = useState(0);
  const [bcvSyncError, setBcvSyncError] = useState(false);

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase
      .from('perfiles_admin')
      .select('role')
      .eq('id', userId)
      .single();
    const role = data?.role || 'admin';
    setUserRole(role);
    if (role === 'asistencia') {
      setActiveTab('asistencia');
      setVisitedTabs(['asistencia']);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) fetchUserRole(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user?.id) fetchUserRole(nextSession.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setVisitedTabs((prev) => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
    setIsSidebarOpen(false);
  }, [activeTab]);

  const syncBcvRate = async (currentConfig: ConfigGlobal) => {
    const lastUpdate = currentConfig.updated_at ? new Date(currentConfig.updated_at) : new Date(0);
    const twelveHoursInMs = 12 * 60 * 60 * 1000;
    const now = new Date();

    if (now.getTime() - lastUpdate.getTime() <= twelveHoursInMs) {
      return;
    }

    const newRate = await fetchBcvRate();
    if (newRate <= 0) {
      setBcvSyncError(true);
      return;
    }
    if (Math.abs(newRate - currentConfig.tasa_bcv) <= 0.0001) {
      return;
    }

    try {
      const { error } = await supabase
        .from('configuracion_global')
        .update({
          tasa_bcv: newRate,
          updated_at: now.toISOString(),
        })
        .eq('id', currentConfig.id);

      if (error) {
        throw error;
      }
    } catch (err) {
      console.error('Error al sincronizar tasa BCV automaticamente:', err);
    }
  };

  const fetchData = async () => {
    try {
      const { data: configData } = await supabase.from('configuracion_global').select('*').single();
      if (configData) {
        setConfig(configData);
        syncBcvRate(configData);
      }

      const { count } = await supabase
        .from('empleados')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true);
      setTotalEmployees(count || 0);

      const { data: employees } = await supabase
        .from('empleados')
        .select('salario_usd')
        .eq('activo', true);

      if (employees && configData) {
        const totalUsd = employees.reduce((sum, emp) => sum + Number(emp.salario_usd), 0);
        setEstimatedPayrollVEF(totalUsd * configData.tasa_bcv);
      }
    } catch (err) {
      console.error('Error cargando datos iniciales:', err);
    }
  };

  useEffect(() => {
    if (!session) {
      return;
    }

    fetchData();

    const configChannel = supabase
      .channel('config-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'configuracion_global' },
        (payload) => {
          const newConfig = payload.new as ConfigGlobal;
          setConfig(newConfig);
          fetchData();
        }
      )
      .subscribe();

    const employeeChannel = supabase
      .channel('employee-stats-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empleados' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(configChannel);
      supabase.removeChannel(employeeChannel);
    };
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-emerald-600"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
            Iniciando sistema experto...
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  const renderContent = () => (
    <div className="relative h-full w-full">
      {visitedTabs.includes('dashboard') && (
        <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
          <DashboardOverview
            config={config}
            totalEmployees={totalEmployees}
            estimatedPayrollVEF={estimatedPayrollVEF}
            setActiveTab={setActiveTab}
          />
        </div>
      )}
      {visitedTabs.includes('sucursales') && (
        <div className={activeTab === 'sucursales' ? 'block' : 'hidden'}>
          <BranchManager />
        </div>
      )}
      {visitedTabs.includes('empleados') && (
        <div className={activeTab === 'empleados' ? 'block' : 'hidden'}>
          <EmployeeTable config={config} />
        </div>
      )}
      {visitedTabs.includes('nomina') && (
        <div className={activeTab === 'nomina' ? 'block' : 'hidden'}>
          <PayrollProcessor config={config} onConfigUpdated={fetchData} />
        </div>
      )}
      {visitedTabs.includes('prestaciones') && (
        <div className={activeTab === 'prestaciones' ? 'block' : 'hidden'}>
          <SocialBenefitsManager config={config} />
        </div>
      )}
      {visitedTabs.includes('asistencia') && (
        <div className={activeTab === 'asistencia' ? 'block' : 'hidden'}>
          <AttendanceManager />
        </div>
      )}
      {visitedTabs.includes('config') && (
        <div className={activeTab === 'config' ? 'block' : 'hidden'}>
          <Configuration config={config} onUpdate={() => {}} />
        </div>
      )}
      {visitedTabs.includes('usuarios') && (
        <div className={activeTab === 'usuarios' ? 'block' : 'hidden'}>
          <UserManager />
        </div>
      )}
    </div>
  );

  const displayName = session.user.user_metadata.full_name || session.user.email;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <ThemeEngine config={config} />
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMobileOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        userRole={userRole}
      />

      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:ml-72 lg:p-12">
        <header className="mb-8 flex flex-col gap-5 lg:mb-12 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                aria-label="Abrir navegacion"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Panel</span>
            </div>

            <h1 className="text-3xl font-black tracking-tighter text-slate-900 sm:text-4xl">
              {TAB_TITLES[activeTab] || activeTab}
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Gestion farmaceutica inteligente
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-3xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-slate-200/70 backdrop-blur sm:w-fit sm:justify-start sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-800">{displayName}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                {userRole === 'asistencia' ? 'Control de Asistencia' : 'Administrador Senior'}
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-black text-white shadow-xl shadow-emerald-500/20 sm:h-14 sm:w-14">
              {(session.user.user_metadata.full_name?.[0] || 'A').toUpperCase()}
            </div>
          </div>
        </header>

        {bcvSyncError && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <svg className="h-5 w-5 shrink-0 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              <strong>Aviso:</strong> No se pudo sincronizar la tasa BCV automaticamente. Se esta usando el ultimo valor guardado ({config?.tasa_bcv ?? '—'} Bs/$).
            </span>
            <button
              type="button"
              onClick={() => setBcvSyncError(false)}
              className="ml-auto shrink-0 text-yellow-600 hover:text-yellow-800"
              aria-label="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        )}
        {renderContent()}
      </main>

      <AIAssistant />
    </div>
  );
};

export default App;
