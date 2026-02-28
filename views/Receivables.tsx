
import React, { useState, useEffect } from 'react';
import { Receivable, User, Client } from '../types';
import { db } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

interface ReceivablesProps {
    currentUser: User;
}

const Receivables: React.FC<ReceivablesProps> = ({ currentUser }) => {
    const [receivables, setReceivables] = useState<(Receivable & { client: Client })[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingReceivable, setEditingReceivable] = useState<any>(null);

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'INFO' | 'DANGER' | 'SUCCESS';
        onConfirm: () => void;
        onCancel?: () => void;
        showPasswordInput?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'INFO',
        onConfirm: () => { },
    });

    const [adminPassword, setAdminPassword] = useState('');

    const showAlert = (config: Partial<typeof alertConfig>) => {
        setAlertConfig(prev => ({ ...prev, isOpen: true, ...config }));
    };

    const closeAlert = () => {
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
        setAdminPassword('');
    };

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = async () => {
        try {
            const data = await db.getReceivables();
            setReceivables(data);
        } catch (err) {
            console.error("Error fetching receivables", err);
        }
    };

    const handleReceive = (receivable: Receivable & { client: Client }) => {
        showAlert({
            title: 'RECEBER PAGAMENTO',
            message: `Deseja registrar o recebimento de R$ ${receivable.amount.toFixed(2)} do cliente ${receivable.client.name}?`,
            type: 'SUCCESS',
            onConfirm: async () => {
                try {
                    await db.receivePayment(receivable.id, 'DIRETAMENTE', currentUser);
                    closeAlert();
                    refreshData();
                    showAlert({ title: 'SUCESSO', message: 'Recebimento registrado e injetado no caixa do dia.', type: 'SUCCESS' });
                } catch (err: any) {
                    showAlert({ title: 'ERRO', message: err.message || 'Erro ao processar recebimento.', type: 'DANGER' });
                }
            }
        });
    };

    const handleDelete = (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'EXCLUIR RECEBÍVEL',
            message: 'Apenas Administradores podem excluir débitos. Insira a senha Master para confirmar:',
            type: 'DANGER',
            showPasswordInput: true,
            onConfirm: async () => {
                const isValid = await db.verifyAdminPassword(adminPassword);
                if (!isValid) {
                    showAlert({ title: 'SENHA INCORRETA', message: 'A senha informada é inválida.', type: 'DANGER' });
                    return;
                }

                try {
                    await db.deleteReceivable(id, currentUser);
                    closeAlert();
                    refreshData();
                    showAlert({ title: 'REMOVIDO', message: 'Débito excluído com sucesso.', type: 'SUCCESS' });
                } catch (err: any) {
                    showAlert({ title: 'ERRO', message: err.message || 'Erro ao excluir.', type: 'DANGER' });
                }
            }
        });
    };

    const calculateStatus = (dueDate: string) => {
        const due = new Date(dueDate);
        const today = new Date();
        const diffTime = today.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 30) {
            return { label: `Vencido (${diffDays} dias)`, color: 'bg-red-500', text: 'text-red-600' };
        } else if (diffDays > 0) {
            return { label: `Vencido (${diffDays} dias)`, color: 'bg-orange-500', text: 'text-orange-600' };
        } else {
            return { label: 'Em dias', color: 'bg-emerald-500', text: 'text-emerald-600' };
        }
    };

    const filtered = receivables.filter(r =>
        r.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.orderId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Gestão de Recebimentos</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Controle de clientes fiado e contas a receber</p>
                </div>

                <div className="flex flex-1 max-w-xl gap-4 w-full">
                    <div className="relative flex-1">
                        <Icons.Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente ou pedido..."
                            className="w-full pl-12 pr-6 py-4 bg-white border-2 border-slate-100 rounded-[1.5rem] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none font-bold text-sm shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {filtered.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
                        {filtered.map(receivable => {
                            const status = calculateStatus(receivable.dueDate);
                            return (
                                <div key={receivable.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                                    <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[8px] font-black uppercase text-white ${status.color}`}>
                                        {status.label}
                                    </div>

                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black uppercase shadow-lg shadow-slate-200">
                                            {receivable.client.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-800 uppercase text-xs truncate max-w-[150px]">{receivable.client.name}</h4>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Pedido: #{receivable.orderId.split('-')[1] || receivable.orderId.substring(0, 8)}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor em Aberto:</span>
                                            <span className="text-xl font-black text-slate-900">R$ {receivable.amount.toFixed(2)}</span>
                                        </div>

                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase px-2">
                                            <div className="flex flex-col">
                                                <span className="text-slate-400">Desde:</span>
                                                <span className="text-slate-800">{new Date(receivable.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-slate-400">Vencimento:</span>
                                                <span className={status.text}>{new Date(receivable.dueDate).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        <div className="pt-4 flex gap-2">
                                            <button
                                                onClick={() => handleReceive(receivable)}
                                                className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 transition-all active:scale-95"
                                            >
                                                Receber
                                            </button>
                                            <button
                                                onClick={() => handleDelete(receivable.id)}
                                                className="flex-1 bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-400 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-30">
                        <Icons.CRM className="w-20 h-20 mb-4" />
                        <p className="font-black uppercase tracking-widest text-sm">Nenhum recebível encontrado</p>
                    </div>
                )}
            </div>

            <CustomAlert
                isOpen={alertConfig.isOpen}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                onCancel={closeAlert}
            >
                {alertConfig.showPasswordInput && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                        <input
                            type="password"
                            placeholder="SENHA MASTER ADMIN"
                            className="w-full p-4 bg-slate-100 border-2 border-slate-200 rounded-2xl text-center font-black outline-none focus:border-red-500 transition-all placeholder:text-slate-300"
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                )}
            </CustomAlert>
        </div>
    );
};

export default Receivables;
