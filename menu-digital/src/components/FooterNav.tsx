import React, { useState } from 'react';
import { fetchConsumption, submitFeedback } from '../api';

interface FooterNavProps {
    tableNumber: string;
    isOwner: boolean;
    pin: string | null;
}

const FooterNav: React.FC<FooterNavProps> = ({ tableNumber, isOwner, pin }) => {
    const [activeModal, setActiveModal] = useState<'consumption' | 'feedback' | 'pin' | null>(null);
    const [consumption, setConsumption] = useState<any>(null);
    const [loadingConsumption, setLoadingConsumption] = useState(false);

    // Feedback state
    const [feedbackName, setFeedbackName] = useState('');
    const [feedbackMsg, setFeedbackMsg] = useState('');
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);

    const handleOpenConsumption = async () => {
        setActiveModal('consumption');
        setLoadingConsumption(true);
        try {
            const data = await fetchConsumption(tableNumber);
            setConsumption(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingConsumption(false);
        }
    };

    const handleSubmitFeedback = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedbackMsg) return;
        setSubmittingFeedback(true);
        try {
            await submitFeedback(tableNumber, feedbackMsg, feedbackName);
            setFeedbackSent(true);
            setTimeout(() => {
                setFeedbackSent(false);
                setFeedbackMsg('');
                setFeedbackName('');
                setActiveModal(null);
            }, 2500);
        } catch (e) {
            alert('Erro ao enviar feedback');
        } finally {
            setSubmittingFeedback(false);
        }
    };

    return (
        <>
            {/* Nav Bar Fixo no Fundo */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 px-6 py-3 pb-8 z-50 flex justify-between items-center max-w-md mx-auto shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
                {/* Botão Extrato */}
                <button
                    onClick={handleOpenConsumption}
                    className="flex flex-col items-center gap-1 text-slate-400 hover:text-blue-600 transition-all active:scale-90"
                >
                    <div className="p-2 bg-slate-50 rounded-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest">Extrato</span>
                </button>

                {/* Botão PIN (Centralizado e Especial) */}
                <button
                    onClick={() => setActiveModal('pin')}
                    className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${isOwner ? 'text-blue-600' : 'text-slate-300'}`}
                >
                    <div className={`p-3 rounded-2xl shadow-lg -translate-y-4 border-4 border-white ${isOwner ? 'bg-blue-600 text-white shadow-blue-500/40' : 'bg-slate-100 text-slate-400'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest -mt-4">Meu PIN</span>
                </button>

                {/* Botão Feedback */}
                <button
                    onClick={() => setActiveModal('feedback')}
                    className="flex flex-col items-center gap-1 text-slate-400 hover:text-blue-600 transition-all active:scale-90"
                >
                    <div className="p-2 bg-slate-50 rounded-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h8M11 12h8M11 19h8M5 5h.01M5 12h.01M5 19h.01" />
                        </svg>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest">Feedback</span>
                </button>
            </nav>

            {/* Modais */}
            {activeModal && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-end justify-center">
                    <div className="absolute inset-0" onClick={() => setActiveModal(null)} />

                    <div className="bg-white rounded-t-[2.5rem] w-full max-w-md p-8 relative animate-slide-up max-h-[80vh] overflow-y-auto">
                        <button onClick={() => setActiveModal(null)} className="absolute top-6 right-6 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>

                        {activeModal === 'pin' && (
                            <div className="text-center py-6">
                                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-3xl mx-auto flex items-center justify-center mb-6">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Seu PIN de Acesso</h3>

                                {isOwner ? (
                                    <>
                                        <div className="text-5xl font-black text-blue-600 tracking-[0.2em] my-8 tabular-nums font-mono">{pin}</div>
                                        <p className="text-slate-500 text-sm leading-relaxed px-4">
                                            Compartilhe este código com outras pessoas que estão na sua mesa para que elas também possam fazer pedidos.
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-red-500 font-bold bg-red-50 p-4 rounded-2xl mt-4">
                                        Apenas o responsável pela mesa pode visualizar o PIN.
                                    </p>
                                )}
                            </div>
                        )}

                        {activeModal === 'consumption' && (
                            <div className="space-y-6">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Seu Extrato</h3>
                                {loadingConsumption ? (
                                    <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
                                ) : (
                                    <div className="space-y-4">
                                        {consumption?.items?.length > 0 ? (
                                            <>
                                                <div className="space-y-3">
                                                    {consumption.items.map((it: any) => (
                                                        <div key={it.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                            <div className="flex gap-3 items-center">
                                                                <span className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-100">{it.quantity}x</span>
                                                                <span className="text-sm font-bold text-slate-700">{it.name}</span>
                                                            </div>
                                                            <span className="text-sm font-black text-slate-900">R$ {(it.price * it.quantity).toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
                                                    <span className="font-black text-slate-400 uppercase tracking-widest text-xs">Total Consumido</span>
                                                    <span className="text-2xl font-black text-blue-600">R$ {consumption.total.toFixed(2)}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-center py-12 text-slate-400 font-bold">Nenhum pedido realizado ainda.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeModal === 'feedback' && (
                            <div className="space-y-6">
                                {feedbackSent ? (
                                    <div className="text-center py-12 animate-in fade-in zoom-in">
                                        <div className="w-20 h-20 bg-emerald-500 rounded-full mx-auto flex items-center justify-center mb-6">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Obrigado!</h3>
                                        <p className="text-slate-500 font-bold mt-2">Sua opinião é muito importante para nós.</p>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Deixe sua opinião</h3>
                                        <form onSubmit={handleSubmitFeedback} className="space-y-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-2">Seu Nome (Opcional)</label>
                                                <input
                                                    type="text"
                                                    placeholder="Como gostaria de ser chamado?"
                                                    value={feedbackName}
                                                    onChange={e => setFeedbackName(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-blue-50 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-2">Sua Mensagem</label>
                                                <textarea
                                                    required
                                                    rows={4}
                                                    placeholder="O que você achou do nosso atendimento?"
                                                    value={feedbackMsg}
                                                    onChange={e => setFeedbackMsg(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-blue-50 outline-none resize-none"
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={submittingFeedback || !feedbackMsg}
                                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-slate-800 disabled:opacity-50 transition-all uppercase tracking-widest text-sm"
                                            >
                                                {submittingFeedback ? 'Enviando...' : 'Enviar Feedback'}
                                            </button>
                                        </form>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default FooterNav;
