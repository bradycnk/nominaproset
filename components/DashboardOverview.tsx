
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ConfigGlobal, Empleado, Asistencia } from '../types';
import CustomizeDashboardModal from './CustomizeDashboardModal.tsx';
import EmployeePerformanceCard from './EmployeePerformanceCard.tsx';

interface DashboardOverviewProps {
  config: ConfigGlobal | null;
  totalEmployees: number;
  estimatedPayrollVEF: number;
  setActiveTab: (tab: string) => void;
}

interface MonthlyTrend {
  month: string;
  present: number;
  absent: number;
}

interface PerformanceData {
  employee: Empleado;
  stats: {
    present: number;
    absent: number;
  };
  monthlyTrend: MonthlyTrend[];
}

interface Alert {
  type: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

const DashboardOverview: React.FC<DashboardOverviewProps> = ({ config, totalEmployees, estimatedPayrollVEF, setActiveTab }) => {
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [visibleStats, setVisibleStats] = useState<string[]>(['Tasa BCV Oficial', 'Cestaticket Indexado', 'Nómina Activa', 'Compromiso VEF']);
  const [topEmployee, setTopEmployee] = useState<PerformanceData | null>(null);
  const [bottomEmployee, setBottomEmployee] = useState<PerformanceData | null>(null);
  
  // Real-time states
  const [pendingLoans, setPendingLoans] = useState(0);
  const [attendanceToday, setAttendanceToday] = useState({ present: 0, total: 0, reported: false });
  const [daysToNextPayment, setDaysToNextPayment] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const today = new Date();
      
      // 1. Calculate Days to Next Payment (15th or Last Day)
      const currentDay = today.getDate();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      let targetDay = 15;
      
      if (currentDay >= 15) {
        targetDay = lastDayOfMonth;
      }
      
      let daysLeft = targetDay - currentDay;
      if (daysLeft < 0) { // Should check for next month 15th if today is past last day (rare edge case logic)
         daysLeft = 15 + (lastDayOfMonth - currentDay);
      }
      setDaysToNextPayment(daysLeft);

      // 2. Performance Data — fetch last 3 months
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const firstDay3Months = threeMonthsAgo.toISOString().split('T')[0];
      const lastDayOfMonthISO = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
      const todayISO = today.toISOString().split('T')[0];

      const months = [
        new Date(today.getFullYear(), today.getMonth() - 2, 1),
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
        new Date(today.getFullYear(), today.getMonth(), 1),
      ];
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

      const { data: employees, error: empError } = await supabase.from('empleados').select('*').eq('activo', true);
      if (empError) return;

      const { data: attendances, error: attError } = await supabase.from('asistencias').select('*').gte('fecha', firstDay3Months).lte('fecha', lastDayOfMonthISO);
      if (attError) return;

      // 3. Today's Attendance
      const todaysRecords = attendances?.filter(a => a.fecha === todayISO) || [];
      const presentCount = todaysRecords.filter(a => a.estado === 'presente').length;
      setAttendanceToday({
        present: presentCount,
        total: employees?.length || 0,
        reported: todaysRecords.length > 0
      });

      // 4. Pending Loans
      const { count: loansCount } = await supabase
        .from('adelantos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
      const loans = loansCount || 0;
      setPendingLoans(loans);

      // 5. Employee Performance Ranking with 3-month trend
      const currentMonthAttendances = attendances?.filter(a => a.fecha >= firstDayOfMonth) || [];

      const performance = employees.map(emp => {
        const empAttendances = currentMonthAttendances.filter(a => a.empleado_id === emp.id);
        const present = empAttendances.filter(a => a.estado === 'presente').length;
        const absent = empAttendances.filter(a => a.estado === 'falta').length;

        const monthlyTrend: MonthlyTrend[] = months.map(m => {
          const mStart = m.toISOString().split('T')[0];
          const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0).toISOString().split('T')[0];
          const mRecords = attendances?.filter(a => a.empleado_id === emp.id && a.fecha >= mStart && a.fecha <= mEnd) || [];
          return {
            month: monthNames[m.getMonth()],
            present: mRecords.filter(a => a.estado === 'presente').length,
            absent: mRecords.filter(a => a.estado === 'falta').length,
          };
        });

        return {
          employee: emp,
          stats: { present, absent },
          monthlyTrend,
          score: present - absent,
        };
      });

      if (performance.length > 0) {
        performance.sort((a, b) => b.score - a.score);
        setTopEmployee(performance[0]);
        setBottomEmployee(performance[performance.length - 1]);
      }

      // 6. Build alerts
      const newAlerts: Alert[] = [];

      if (loans > 0) {
        newAlerts.push({ type: 'loans', message: `${loans} solicitud(es) de adelanto pendiente(s)`, severity: 'high' });
      }

      // Employees with >3 absences this month
      const employeesWithAbsences = performance.filter(p => p.stats.absent > 3);
      if (employeesWithAbsences.length > 0) {
        newAlerts.push({ type: 'absences', message: `${employeesWithAbsences.length} empleado(s) con más de 3 ausencias este mes`, severity: 'medium' });
      }

      // Contracts expiring in ≤30 days
      const expiringContracts = employees.filter(emp => {
        if (!emp.fecha_inicio_contrato || !emp.duracion_contrato_meses) return false;
        const start = new Date(emp.fecha_inicio_contrato);
        const end = new Date(start.getFullYear(), start.getMonth() + emp.duracion_contrato_meses, start.getDate());
        const diffDays = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 30;
      });
      if (expiringContracts.length > 0) {
        newAlerts.push({ type: 'contracts', message: `${expiringContracts.length} contrato(s) vence(n) en los próximos 30 días`, severity: 'high' });
      }

      setAlerts(newAlerts);
    };

    fetchData();
  }, [totalEmployees]); // Re-run if total employees changes

  
  const stats = [
    {
      label: 'Tasa BCV Oficial',
      value: `Bs. ${config?.tasa_bcv?.toLocaleString('es-VE', { minimumFractionDigits: 4 }) || '---'}`,
      tab: 'config',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      color: 'from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-200'
    },
    {
      label: 'Cestaticket Indexado',
      value: `$${config?.cestaticket_usd || '---'}`,
      tab: 'config',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      color: 'from-orange-400 to-rose-500',
      shadow: 'shadow-orange-200'
    },
    {
      label: 'Nómina Activa',
      value: totalEmployees.toString(),
      tooltip: 'Número total de empleados activos en la nómina.',
      tab: 'empleados',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 005.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'from-emerald-400 to-teal-600',
      shadow: 'shadow-emerald-200'
    },
    {
      label: 'Compromiso VEF',
      value: `Bs. ${estimatedPayrollVEF.toLocaleString('es-VE', { minimumFractionDigits: 0 })}`,
      tooltip: 'Estimación del pago total de la nómina en Bolívares (VEF).',
      tab: 'nomina',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'from-purple-500 to-violet-700',
      shadow: 'shadow-purple-200'
    },
  ];

  const filteredStats = stats.filter(stat => visibleStats.includes(stat.label));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex justify-end mb-4">
        <button 
          onClick={() => setShowCustomizeModal(true)}
          className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold"
        >
          Personalizar
        </button>
      </div>
      
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
        {filteredStats.map((stat, idx) => (
          <div
            key={idx}
            title={stat.tooltip}
            onClick={() => setActiveTab(stat.tab)}
            className={`group bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col gap-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:border-emerald-100 relative overflow-hidden cursor-pointer`}
          >
            <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full bg-gradient-to-br ${stat.color} opacity-5 group-hover:scale-150 transition-transform duration-700`}></div>

            <div className={`bg-gradient-to-br ${stat.color} w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform duration-300 group-hover:rotate-12`}>
              {stat.icon}
            </div>

            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900 tracking-tight group-hover:text-emerald-600 transition-colors">
                {stat.value}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronizado</span>
              </div>
              <span className="text-[10px] font-bold text-slate-300 group-hover:text-emerald-500 transition-colors">Ver →</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        {/* Main Welcome/Status Card */}
        <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 transition-transform duration-700 group-hover:scale-125">
              <svg className="w-32 h-32 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04M12 21a9.003 9.003 0 008.367-5.633a9.003 9.003 0 00-8.367-5.633A9.003 9.003 0 003.633 15.367A9.003 9.003 0 0012 21z" />
              </svg>
          </div>
          
          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Bienvenido al Panel de Control</h2>
          <p className="text-slate-500 leading-relaxed text-lg mb-10 max-w-xl">
            Gestión administrativa de farmacias parametrizada según la LOTTT 2026.{' '}
            {attendanceToday.present > 0
              ? `Hoy se han registrado ${attendanceToday.present} de ${attendanceToday.total} asistencias.`
              : 'Ninguna asistencia registrada hoy.'}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-emerald-200 transition-all duration-300">
              <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h4 className="font-black text-slate-800 text-sm uppercase tracking-wider mb-2">Accesos Rápidos</h4>
              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('asistencia')}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-500 transition-colors"
                >
                  Registrar Asistencia
                </button>
                <button 
                   onClick={() => setActiveTab('empleados')}
                   className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  Nuevo Empleado
                </button>
              </div>
            </div>

            <div className="p-8 bg-emerald-600 rounded-[2rem] shadow-xl shadow-emerald-900/10 text-white relative overflow-hidden group">
              <div className="relative z-10">
                <h4 className="font-black text-[10px] uppercase tracking-[0.2em] mb-4 opacity-80">Estado Operativo</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-2">
                        <span>Asistencia Global</span>
                        <span>{totalEmployees > 0 ? Math.round((attendanceToday.present / totalEmployees) * 100) : 0}%</span>
                    </div>
                    <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-1000"
                          style={{ width: `${totalEmployees > 0 ? (attendanceToday.present / totalEmployees) * 100 : 0}%` }}
                        ></div>
                    </div>
                    <p className="text-[10px] text-white/60 mt-2">{attendanceToday.present} / {attendanceToday.total} presentes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action/Alert Side Card */}
        <div className="bg-[#1E1E2D] p-8 rounded-[3rem] shadow-2xl flex flex-col justify-between text-white relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent"></div>
            <div>
              <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/30 group-hover:rotate-6 transition-transform">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
              </div>
              <h3 className="text-xl font-black mb-3 tracking-tight">Próximos Eventos</h3>

              {alerts.length === 0 ? (
                <p className="text-slate-500 text-xs font-medium leading-relaxed">Todo en orden. Sin alertas activas.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((alert, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${alert.severity === 'high' ? 'bg-rose-500' : alert.severity === 'medium' ? 'bg-yellow-400' : 'bg-emerald-400'}`}></span>
                      <span className="text-xs text-slate-300 leading-relaxed">{alert.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-8 space-y-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500">Próximo Pago</span>
                  <span className="text-xs font-bold text-emerald-400">
                    {daysToNextPayment === 0 ? "¡Es Hoy!" : `En ${daysToNextPayment} días`}
                  </span>
              </div>

              {pendingLoans > 0 && (
                <button
                  onClick={() => setActiveTab('nomina')}
                  className="w-full bg-rose-500 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-500/20 hover:bg-rose-400 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>Revisar Solicitudes</span>
                  <span className="bg-white text-rose-600 w-5 h-5 rounded-full flex items-center justify-center text-[9px]">{pendingLoans}</span>
                </button>
              )}

              <button
                onClick={() => setActiveTab('asistencia')}
                className="w-full bg-emerald-500 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all active:scale-95"
              >
                Ver Asistencias
              </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        {topEmployee && <EmployeePerformanceCard employee={topEmployee.employee} stats={topEmployee.stats} monthlyTrend={topEmployee.monthlyTrend} rank="High" />}
        {bottomEmployee && <EmployeePerformanceCard employee={bottomEmployee.employee} stats={bottomEmployee.stats} monthlyTrend={bottomEmployee.monthlyTrend} rank="Low" />}
      </div>

      <CustomizeDashboardModal 
        isOpen={showCustomizeModal}
        onClose={() => setShowCustomizeModal(false)}
        stats={stats.map(s => s.label)}
        visibleStats={visibleStats}
        onVisibleStatsChange={setVisibleStats}
      />
    </div>
  );
};

export default DashboardOverview;
