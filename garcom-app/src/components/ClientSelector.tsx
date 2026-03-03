import React, { useState, useEffect } from 'react';
import { Search, X, ArrowRight, UserPlus } from 'lucide-react';
import { db } from '../api';

interface ClientSelectorProps {
    onSelect: (clientId: string, clientName: string) => void;
    onClose: () => void;
    title?: string;
    showAnonymous?: boolean;
    anonymousLabel?: string;
}

const ClientSelector: React.FC<ClientSelectorProps> = ({
    onSelect,
    onClose,
    title = "Identificar Cliente",
    showAnonymous = true,
    anonymousLabel = "Consumidor Avulso"
}) => {
    const [clients, setClients] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchClients = async () => {
            try {
                const data = await db.getClients();
                setClients(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchClients();
    }, []);

    const filtered = clients.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
    );

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div
                className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in duration-300 relative"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{title}</h3>
                    <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar cliente..."
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none ring-2 ring-transparent focus:ring-blue-500/10 transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="max-h-64 overflow-y-auto mb-2 pr-2 space-y-2 custom-scrollbar">
                    {showAnonymous && (
                        <button
                            onClick={() => onSelect('ANONYMOUS', anonymousLabel)}
                            className="w-full p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between group hover:bg-blue-600 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <UserPlus size={18} className="text-blue-500 group-hover:text-white" />
                                <span className="text-xs font-black text-blue-600 uppercase tracking-widest group-hover:text-white">{anonymousLabel}</span>
                            </div>
                            <ArrowRight size={16} className="text-blue-400 group-hover:text-white" />
                        </button>
                    )}

                    {loading ? (
                        <div className="py-8 text-center">
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando Clientes...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum cliente encontrado</p>
                        </div>
                    ) : (
                        filtered.map(client => (
                            <button
                                key={client.id}
                                onClick={() => onSelect(client.id, client.name)}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between group hover:bg-slate-900 transition-all"
                            >
                                <div className="text-left">
                                    <p className="text-xs font-black text-slate-700 uppercase group-hover:text-white">{client.name || 'Sem Nome'}</p>
                                    <p className="text-[9px] font-bold text-slate-400 group-hover:text-slate-400/60 uppercase">{client.phone || 'S/ Telefone'}</p>
                                </div>
                                <ArrowRight size={16} className="text-slate-300 group-hover:text-white" />
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClientSelector;
