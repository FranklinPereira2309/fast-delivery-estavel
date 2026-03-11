import React, { useState } from 'react';
import { api } from '../services/api';
import type { Client } from '../types';

interface CompleteProfileModalProps {
    isOpen: boolean;
    client: Client;
    onComplete: (updatedClient: Client) => void;
}

const CompleteProfileModal: React.FC<CompleteProfileModalProps> = ({ isOpen, client, onComplete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingCep, setIsFetchingCep] = useState(false);
    const [phone, setPhone] = useState(client.phone === '00000000000' ? '' : client.phone);
    const [error, setError] = useState('');

    const [address, setAddress] = useState({
        cep: client.cep || '',
        street: client.street || '',
        number: client.addressNumber || '',
        neighborhood: client.neighborhood || '',
        city: client.city || '',
        state: client.state || '',
        complement: client.complement || ''
    });

    if (!isOpen) return null;

    const maskPhone = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 2) return numbers;
        if (numbers.length <= 3) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
        if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 3)} ${numbers.slice(3)}`;
        return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 3)} ${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
    };

    const handleCepBlur = async () => {
        const cleanCep = address.cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return;

        setIsFetchingCep(true);
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();

            if (!data.erro) {
                setAddress(prev => ({
                    ...prev,
                    street: data.logradouro || '',
                    neighborhood: data.bairro || '',
                    city: data.localidade || '',
                    state: data.uf || ''
                }));
            }
        } catch (err) {
            console.error('ViaCEP Error:', err);
        } finally {
            setIsFetchingCep(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length !== 11) {
            setError('WhatsApp inválido. Insira 11 dígitos.');
            return;
        }

        if (!address.cep || !address.street || !address.number || !address.neighborhood || !address.city || !address.state) {
            setError('Preencha todos os campos do endereço.');
            return;
        }

        setIsLoading(true);
        try {
            const updateData = {
                phone: cleanPhone,
                cep: address.cep.replace(/\D/g, ''),
                street: address.street,
                addressNumber: address.number,
                neighborhood: address.neighborhood,
                city: address.city,
                state: address.state,
                complement: address.complement
            };

            const updatedClient = await api.updateClient(client.id, updateData);
            localStorage.setItem('delivery_app_client', JSON.stringify(updatedClient));
            onComplete(updatedClient);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Erro ao atualizar cadastro.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-50 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Completar Cadastro</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                        Precisamos desses dados para realizar entregas
                    </p>
                </div>

                <form onSubmit={handleSave} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp</label>
                        <input
                            type="tel"
                            required
                            placeholder="(00) 0 0000-0000"
                            className="w-full p-4 bg-white border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                            value={phone}
                            onChange={e => setPhone(maskPhone(e.target.value))}
                        />
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Endereço de Entrega</label>
                        <div className="bg-white rounded-[1.5rem] p-4 shadow-sm border border-slate-100 space-y-3">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="CEP"
                                    required
                                    maxLength={10}
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                    value={address.cep}
                                    onBlur={handleCepBlur}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        let masked = val;
                                        if (val.length > 2) masked = `${val.slice(0, 2)}.${val.slice(2)}`;
                                        if (val.length > 5) masked = `${val.slice(0, 2)}.${val.slice(2, 5)}-${val.slice(5, 8)}`;
                                        setAddress({ ...address, cep: masked });
                                    }}
                                />
                                {isFetchingCep && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                            </div>
                            <input
                                type="text"
                                placeholder="Rua"
                                required
                                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                value={address.street}
                                onChange={e => setAddress({ ...address, street: e.target.value })}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    placeholder="Número"
                                    required
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                    value={address.number}
                                    onChange={e => setAddress({ ...address, number: e.target.value })}
                                />
                                <input
                                    type="text"
                                    placeholder="Bairro"
                                    required
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                    value={address.neighborhood}
                                    onChange={e => setAddress({ ...address, neighborhood: e.target.value })}
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Complemento"
                                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                value={address.complement}
                                onChange={e => setAddress({ ...address, complement: e.target.value })}
                            />
                            <div className="grid grid-cols-3 gap-3">
                                <input
                                    type="text"
                                    placeholder="Cidade"
                                    required
                                    className="col-span-2 w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                    value={address.city}
                                    onChange={e => setAddress({ ...address, city: e.target.value })}
                                />
                                <input
                                    type="text"
                                    placeholder="UF"
                                    required
                                    maxLength={2}
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none uppercase"
                                    value={address.state}
                                    onChange={e => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-100 animate-in fade-in duration-300">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase text-[12px] tracking-widest shadow-xl shadow-indigo-200 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isLoading ? 'Salvando...' : 'Finalizar Cadastro'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CompleteProfileModal;
