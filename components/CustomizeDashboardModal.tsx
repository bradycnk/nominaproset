
import React from 'react';

interface CustomizeDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: string[];
  visibleStats: string[];
  onVisibleStatsChange: (visibleStats: string[]) => void;
}

const CustomizeDashboardModal: React.FC<CustomizeDashboardModalProps> = ({ isOpen, onClose, stats, visibleStats, onVisibleStatsChange }) => {
  if (!isOpen) return null;

  const handleCheckboxChange = (stat: string) => {
    const newVisibleStats = visibleStats.includes(stat)
      ? visibleStats.filter(s => s !== stat)
      : [...visibleStats, stat];
    onVisibleStatsChange(newVisibleStats);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300 relative">
        <button onClick={onClose} className="absolute top-6 right-8 text-slate-400 hover:text-slate-600">✕</button>
        
        <div className="mb-8">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Personalizar Dashboard</h3>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">Seleccione las tarjetas a mostrar</p>
        </div>

        <div className="space-y-4">
          {stats.map(stat => (
            <label key={stat} className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
              <input 
                type="checkbox" 
                className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                checked={visibleStats.includes(stat)}
                onChange={() => handleCheckboxChange(stat)}
              />
              <span className="text-sm font-bold text-slate-800">{stat}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end pt-8">
          <button 
            onClick={onClose}
            className="bg-[#1E1E2D] text-white py-3 px-6 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomizeDashboardModal;
