import React from 'react';
import { Empleado } from '../types';

interface MonthlyTrend {
  month: string;
  present: number;
  absent: number;
}

interface EmployeePerformanceCardProps {
  employee: Empleado | null;
  stats: {
    present: number;
    absent: number;
  };
  monthlyTrend?: MonthlyTrend[];
  rank: 'High' | 'Low';
}

const EmployeePerformanceCard: React.FC<EmployeePerformanceCardProps> = ({ employee, stats, monthlyTrend, rank }) => {
  if (!employee) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center text-slate-400">
        Cargando datos...
      </div>
    );
  }

  const rating = rank === 'High' ? 5 : 1;
  const rankText = rank === 'High' ? 'Empleado de Nivel Alto' : 'Empleado de Nivel Bajo';
  const rankColor = rank === 'High' ? 'text-emerald-500' : 'text-rose-500';
  const barColor = rank === 'High' ? 'bg-emerald-500' : 'bg-rose-400';

  const maxPresent = monthlyTrend ? Math.max(...monthlyTrend.map(m => m.present), 1) : 1;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <h3 className={`text-sm font-bold uppercase tracking-wider ${rankColor}`}>{rankText}</h3>
      <div className="flex items-center mt-4">
        {employee.foto_url ? (
          <img src={employee.foto_url} alt={`${employee.nombre} ${employee.apellido}`} className="w-16 h-16 rounded-full object-cover mr-4" onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).parentElement!.querySelector('.avatar-fallback')?.classList.remove('hidden');
          }} />
        ) : null}
        <div className={`avatar-fallback w-16 h-16 rounded-full mr-4 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-600 flex-shrink-0 ${employee.foto_url ? 'hidden' : ''}`}>
          <svg className="w-8 h-8 text-white/90" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
          <span className="text-[7px] font-bold text-white/80 uppercase">{employee.nombre[0]}{employee.apellido[0]}</span>
        </div>
        <div>
          <p className="font-bold text-slate-800">{employee.nombre} {employee.apellido}</p>
          <p className="text-sm text-slate-500">{employee.cargo}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-sm">
          <p className="text-slate-500">Días Presente:</p>
          <p className="font-bold text-slate-800">{stats.present}</p>
        </div>
        <div className="flex justify-between text-sm">
          <p className="text-slate-500">Días Ausente:</p>
          <p className="font-bold text-slate-800">{stats.absent}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center">
        {'⭐'.repeat(rating)}
        {'☆'.repeat(5 - rating)}
      </div>

      {monthlyTrend && monthlyTrend.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Tendencia 3 meses</p>
          <div className="flex gap-3 items-end">
            {monthlyTrend.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500">{m.present}d</span>
                <div className="w-full bg-slate-100 rounded-full overflow-hidden" style={{ height: '40px' }}>
                  <div
                    className={`${barColor} w-full rounded-full transition-all duration-700`}
                    style={{ height: `${Math.round((m.present / maxPresent) * 100)}%`, marginTop: `${100 - Math.round((m.present / maxPresent) * 100)}%` }}
                  ></div>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeePerformanceCard;
