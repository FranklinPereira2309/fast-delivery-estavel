
import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { db } from '../services/db';

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
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
      case 'DELETE_ORDER': return 'bg-red-100 text-red-600';
      case 'EDIT_ORDER': return 'bg-blue-100 text-blue-600';
      case 'CREATE_ORDER': return 'bg-emerald-100 text-emerald-600';
      case 'LOGIN': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-50 text-slate-400';
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Logs de Auditoria</h3>
          <p className="text-sm text-slate-500">Histórico completo de ações críticas do sistema.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:border-blue-500 transition-colors"
          />
          <span className="text-slate-400 text-sm">até</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-sm rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="text-blue-600 disabled:opacity-50 text-sm font-bold flex items-center gap-2 hover:bg-blue-50 px-3 py-2 rounded-xl transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {isLoading ? 'Filtrando...' : 'Filtrar'}
          </button>

          <button
            onClick={handleDownloadCSV}
            disabled={logs.length === 0}
            className="bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-emerald-600 text-white shadow-sm text-sm font-bold flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            Baixar CSV
          </button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto border border-slate-100 rounded-2xl">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-white border-b border-slate-200">
            <tr className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">
              <th className="px-6 py-4">Data/Hora</th>
              <th className="px-6 py-4">Usuário</th>
              <th className="px-6 py-4">Ação</th>
              <th className="px-6 py-4">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length > 0 ? logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-xs font-medium text-slate-600">
                  {new Date(log.timestamp).toLocaleString('pt-BR')}
                </td>
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-800 text-xs">{log.userName}</p>
                  <p className="text-[9px] text-slate-400 uppercase tracking-tighter">{log.userId}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wide ${getActionColor(log.action)}`}>
                    {log.action.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500 italic max-w-xs truncate" title={log.details}>
                  {log.details}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Nenhum log registrado até o momento.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLogs;
