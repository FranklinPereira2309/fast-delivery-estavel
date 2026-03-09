
import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { db } from '../services/db';
import { getLocalIsoDate } from '../services/dateUtils';

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [startDate, setStartDate] = useState(getLocalIsoDate());
  const [endDate, setEndDate] = useState(getLocalIsoDate());
  const [isLoading, setIsLoading] = useState(false);

  // Allow filter refetch
  const fetchLogs = async () => {
    setIsLoading(true);
    const allLogs = await db.getAuditLogs(startDate, endDate);
    setLogs(allLogs);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [startDate, endDate]);

  const getActionColor = (action: AuditLog['action']) => {
    switch (action) {
      case 'DELETE_ORDER': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
      case 'EDIT_ORDER': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
      case 'CREATE_ORDER': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
      case 'LOGIN': return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
      default: return 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500';
    }
  };

  const handleDownloadCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Data/Hora', 'Usuario_ID', 'Usuario_Nome', 'Acao', 'Detalhes'];
    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString('pt-BR').replace(',', ''),
      log.userId,
      log.userName,
      log.action,
      `"${log.details.replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_sistema_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in transition-colors">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Histórico de Auditoria</h3>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Registro completo de atividades críticas do sistema</p>
        </div>

        <div className="w-full xl:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-2xl border border-slate-100 dark:border-slate-700">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-[11px] font-black uppercase text-slate-600 dark:text-slate-300 outline-none p-2 cursor-pointer"
            />
            <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-[11px] font-black uppercase text-slate-600 dark:text-slate-300 outline-none p-2 cursor-pointer"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {isLoading ? '...' : 'Filtrar'}
            </button>

            <button
              onClick={handleDownloadCSV}
              disabled={logs.length === 0}
              className="flex-1 sm:flex-none border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              Exportar
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        {/* Desktop View (Table) */}
        <div className="hidden md:block max-h-[600px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-3xl custom-scrollbar transition-all shadow-sm">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 z-10">
              <tr className="text-slate-300 dark:text-slate-600 text-[9px] uppercase font-black tracking-[0.2em]">
                <th className="px-8 py-5">Data e Hora</th>
                <th className="px-8 py-5">Responsável</th>
                <th className="px-8 py-5 text-center">Ação Realizada</th>
                <th className="px-8 py-5">Detalhes da Atividade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {logs.length > 0 ? logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all">
                  <td className="px-8 py-6 text-[11px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-black text-slate-800 dark:text-white text-xs uppercase tracking-tight">{log.userName}</p>
                    <p className="text-[9px] text-slate-300 dark:text-slate-600 font-bold uppercase mt-0.5">{log.userId.slice(0, 10)}...</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`inline-block text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest ${getActionColor(log.action)}`}>
                      {log.action.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-xs text-slate-500 dark:text-slate-400 italic max-w-sm" title={log.details}>
                    <span className="truncate block">{log.details}</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center opacity-30">
                      <p className="text-xs font-black uppercase tracking-widest">Nenhuma atividade encontrada</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="md:hidden space-y-4 max-h-[600px] overflow-y-auto pb-8 pr-1 custom-scrollbar">
          {logs.length > 0 ? logs.map(log => (
            <div key={log.id} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm active:scale-95 transition-all">
              <div className="flex justify-between items-start mb-4">
                <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${getActionColor(log.action)}`}>
                  {log.action.replace('_', ' ')}
                </span>
                <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 tabular-nums">
                  {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Responsável</p>
                <p className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tighter">{log.userName}</p>
                <p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 truncate">{new Date(log.timestamp).toLocaleDateString('pt-BR')}</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Detalhes</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed italic">{log.details}</p>
              </div>
            </div>
          )) : (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 text-center opacity-40">
              <p className="text-[10px] font-black uppercase tracking-widest">Sem registros</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
