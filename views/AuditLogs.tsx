
import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { db } from '../services/db';

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  // Fixed: Correctly awaiting async DB call in useEffect
  useEffect(() => {
    const fetchLogs = async () => {
      const allLogs = await db.getAuditLogs();
      setLogs(allLogs);
    };
    fetchLogs();
  }, []);

  const getActionColor = (action: AuditLog['action']) => {
    switch (action) {
      case 'DELETE_ORDER': return 'bg-red-100 text-red-600';
      case 'EDIT_ORDER': return 'bg-blue-100 text-blue-600';
      case 'CREATE_ORDER': return 'bg-emerald-100 text-emerald-600';
      case 'LOGIN': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-50 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Logs de Auditoria</h3>
          <p className="text-sm text-slate-500">Histórico completo de ações críticas do sistema.</p>
        </div>
        <button 
          // Fixed: Wrapped async call to refresh logs
          onClick={async () => setLogs(await db.getAuditLogs())}
          className="text-blue-600 text-sm font-bold flex items-center gap-2 hover:bg-blue-50 px-3 py-2 rounded-xl"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Atualizar
        </button>
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
