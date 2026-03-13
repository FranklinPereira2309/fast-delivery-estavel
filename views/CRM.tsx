
import React, { useState, useEffect } from 'react';
import { Client, User } from '../types';
import { db } from '../services/db';
import CustomAlert from '../components/CustomAlert';
import { validateEmail, validateCPF, validateCNPJ, maskPhone, maskDocument, toTitleCase } from '../services/validationUtils';
import { Eye, EyeOff, RefreshCw, MapPin, Save, X, Check } from 'lucide-react';
import { useToast } from '../hooks/useToast';

interface CRMProps {
  currentUser: User;
}

const CRM: React.FC<CRMProps> = ({ currentUser }) => {
  const { addToast } = useToast();
  const formatClientAddress = (client: Client) => {
    if (client.addresses && client.addresses.length > 0 && client.addresses[0]) {
      return client.addresses[0];
    }

    // Fallback to structured fields
    if (client.street) {
      const parts = [
        [client.street, client.addressNumber, client.complement].filter(Boolean).join(', '),
        [client.neighborhood, client.city, client.state?.toUpperCase()].filter(Boolean).join(', ')
      ].filter(Boolean).join(' - ');
      return parts || 'Endereço incompleto';
    }

    return 'Nenhum endereço';
  };

  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados do CustomAlert
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'INFO' | 'DANGER' | 'SUCCESS';
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'INFO',
    onConfirm: () => { },
  });

  const showAlert = (title: string, message: string, type: 'INFO' | 'DANGER' | 'SUCCESS' = 'INFO', onConfirm = () => setAlertConfig(prev => ({ ...prev, isOpen: false })), onCancel?: () => void) => {
    setAlertConfig({ isOpen: true, title, message, type, onConfirm, onCancel });
  };

  const closeAlert = () => setAlertConfig(prev => ({ ...prev, isOpen: false }));

  // Form State atualizado para campos detalhados de endereço
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    document: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: ''
  });

  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});

  const togglePinVisibility = (clientId: string) => {
    setVisiblePins(prev => ({ ...prev, [clientId]: !prev[clientId] }));
  };

  const handleResetPin = async (clientId: string) => {
    if (!currentUser.permissions.includes('admin') && !currentUser.permissions.includes('settings')) {
      addToast({ title: 'Acesso Negado', message: 'Apenas usuários autorizados podem resetar o PIN.', type: 'DANGER' });
      return;
    }

    try {
      await db.resetClientPin(clientId, currentUser);
      addToast({ title: 'Sucesso', message: 'O PIN de acesso deste cliente foi regerado com sucesso.', type: 'SUCCESS' });
      refreshClients();
    } catch (error: any) {
      console.error(error);
      addToast({ title: 'Erro', message: error.message || 'Não foi possível resetar o PIN.', type: 'DANGER' });
    }
  };

  const handleResetPassword = async (clientId: string) => {
    if (!currentUser.permissions.includes('admin') && !currentUser.permissions.includes('settings')) {
      addToast({ title: 'Acesso Negado', message: 'Apenas usuários autorizados podem resetar senhas.', type: 'DANGER' });
      return;
    }

    showAlert(
      'Resetar Senha',
      'Tem certeza que deseja resetar a senha deste cliente para "123"? Ele será obrigado a trocar no próximo login.',
      'DANGER',
      async () => {
        closeAlert();
        try {
          await db.resetClientPassword(clientId, currentUser);
          addToast({ title: 'Sucesso', message: 'Senha resetada para "123" com sucesso!', type: 'SUCCESS' });
          refreshClients();
        } catch (error: any) {
          console.error(error);
          addToast({ title: 'Erro', message: error.message || 'Não foi possível resetar a senha.', type: 'DANGER' });
        }
      },
      () => closeAlert()
    );
  };

  useEffect(() => {
    refreshClients();
  }, []);

  const refreshClients = async () => {
    const allClients = await db.getClients();
    setClients(allClients);
  };

  const openAddModal = () => {
    setEditingClient(null);
    setErrors({});
    setFormData({
      name: '',
      phone: '',
      email: '',
      document: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setErrors({});

    setFormData({
      name: client.name,
      phone: client.phone,
      email: client.email || '',
      document: client.document || '',
      cep: client.cep || '',
      logradouro: client.street || '',
      numero: client.addressNumber || '',
      complemento: client.complement || '',
      bairro: client.neighborhood || '',
      cidade: client.city || '',
      uf: client.state || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!currentUser.permissions.includes('admin') && !currentUser.permissions.includes('settings')) {
      addToast({ title: 'Acesso Negado', message: 'Você não tem permissão para excluir clientes.', type: 'DANGER' });
      return;
    }

    showAlert(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir este cliente?',
      'DANGER',
      async () => {
        closeAlert();
        try {
          await db.deleteClient(id, currentUser);
          refreshClients();
          addToast({ title: 'Sucesso', message: 'Cliente removido com sucesso!', type: 'SUCCESS' });
        } catch (error: any) {
          addToast({ title: 'Erro na Exclusão', message: error.message || 'Erro ao remover cliente.', type: 'DANGER' });
        }
      },
      () => closeAlert()
    );
  };

  const fetchAddress = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setIsLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        addToast({ title: 'CEP Inválido', message: 'CEP não encontrado.', type: 'INFO' });
      } else {
        setFormData(prev => ({
          ...prev,
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || ''
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      addToast({ title: 'Erro de Conexão', message: 'Não foi possível conectar ao serviço de busca de CEP. Por favor, preencha manualmente.', type: 'DANGER' });
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setFormData({ ...formData, cep: value });
    if (value.length === 8) {
      fetchAddress(value);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, boolean> = {};

    if (!formData.name) newErrors.name = true;

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 11) newErrors.phone = true;

    if (formData.document) {
      const cleanDoc = formData.document.replace(/\D/g, '');
      if (cleanDoc.length === 11) {
        if (!validateCPF(cleanDoc)) newErrors.document = true;
      } else if (cleanDoc.length === 14) {
        if (!validateCNPJ(cleanDoc)) newErrors.document = true;
      } else {
        newErrors.document = true;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      addToast({ title: 'Campos Inválidos', message: 'Verifique os campos destacados em vermelho.', type: 'DANGER' });
      return;
    }

    if (formData.email && !validateEmail(formData.email)) {
      setErrors({ email: true });
      addToast({ title: 'Email Inválido', message: 'Por favor, insira um endereço de email válido.', type: 'WARNING' });
      return;
    }

    const fullAddress = `${formData.logradouro}, ${formData.numero}${formData.complemento ? ' - ' + formData.complemento : ''}, ${formData.bairro}, ${formData.cidade} - ${formData.uf}`;

    const clientData: Client = {
      id: editingClient?.id || '', // Empty ID tells backend it's new
      name: toTitleCase(formData.name),
      phone: formData.phone.replace(/\D/g, ''),
      email: formData.email || undefined,
      document: formData.document || undefined,
      cep: formData.cep || undefined,
      street: formData.logradouro || undefined,
      addressNumber: formData.numero || undefined,
      complement: formData.complement || undefined,
      neighborhood: formData.bairro || undefined,
      city: formData.cidade || undefined,
      state: (formData.uf || '').toUpperCase() || undefined,
      addresses: [fullAddress],
      totalOrders: editingClient?.totalOrders || 0,
      lastOrderDate: editingClient?.lastOrderDate || '-'
    };

    setIsSubmitting(true);
    try {
      await db.saveClient(clientData);
      refreshClients();
      setIsModalOpen(false);
      setErrors({});
      addToast({ title: 'Sucesso', message: editingClient ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!', type: 'SUCCESS' });
    } catch (error: any) {
      console.error(error);
      addToast({ title: 'Erro ao Salvar', message: error.message || 'Não foi possível salvar os dados do cliente.', type: 'DANGER' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col h-full overflow-hidden relative">
      <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={openAddModal}
            className="flex-1 sm:flex-none justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Cliente
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px] sm:min-w-0">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Telefone</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">PIN (Acesso App)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Endereço Principal</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center">Pedidos</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length > 0 ? filtered.map(client => (
              <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-800 dark:text-slate-200">{client.name}</p>
                    {client.googleId && (
                      <span className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter border border-blue-100 dark:border-blue-800/50">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="currentColor" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor" />
                        </svg>
                        Google
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Último: {client.lastOrderDate || '-'}</p>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{client.phone}</td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                  {client.pin ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded w-16 text-center select-all dark:text-slate-200">{visiblePins[client.id] ? client.pin : '••••'}</span>
                      <button onClick={() => togglePinVisibility(client.id)} className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" title={visiblePins[client.id] ? "Ocultar PIN" : "Revelar PIN"}>
                        {visiblePins[client.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : <span className="text-xs text-slate-400 dark:text-slate-500 italic">Não gerado</span>}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 max-w-md xl:max-w-lg truncate">
                  <div className="flex items-center gap-2">
                    {client.street && !client.addresses?.[0] && <MapPin className="w-3 h-3 text-amber-500" title="Endereço gerado dinamicamente" />}
                    {formatClientAddress(client)}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg text-xs font-bold">
                    {client.totalOrders}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleResetPin(client.id)}
                      className="p-2 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-lg transition-all"
                      title="Regerar PIN de Acesso"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(client)}
                      className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-all"
                      title="Editar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-all"
                      title="Excluir"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 italic">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] sm:rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 border border-transparent dark:border-slate-800">
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
              <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
                {editingClient ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
              </h3>
                <div className="flex items-center gap-2">
                  {editingClient && (
                    <button
                      type="button"
                      onClick={() => handleResetPassword(editingClient.id)}
                      className="p-1.5 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white rounded-full transition-all shadow-lg active:scale-95"
                      title="Resetar Senha para 123"
                    >
                      <RefreshCw className="h-6 w-6" />
                    </button>
                  )}
                  <button
                    type="submit"
                    form="client-form"
                    disabled={isSubmitting}
                    className={`p-1.5 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-all shadow-lg active:scale-95 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                    title="Salvar Cliente"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="h-6 w-6 animate-spin" />
                    ) : (
                      <Check className="h-6 w-6 stroke-[3]" />
                    )}
                  </button>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-all"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
            </div>

            <form id="client-form" onSubmit={handleSave} className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.name ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Nome Completo *</label>
                  <input
                    type="text"
                    required
                    className={`w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${errors.name ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="Ex: João da Silva"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: toTitleCase(e.target.value) });
                      if (errors.name) setErrors(prev => ({ ...prev, name: false }));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.phone ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Telefone / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    className={`w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${errors.phone ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="Ex: (11) 9 9999-9999"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({ ...formData, phone: maskPhone(e.target.value) });
                      if (errors.phone) setErrors(prev => ({ ...prev, phone: false }));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.email ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Email</label>
                  <input
                    type="email"
                    className={`w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${errors.email ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="Ex: joao@email.com"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (errors.email) setErrors(prev => ({ ...prev, email: false }));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.document ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>CPF / CNPJ</label>
                  <input
                    type="text"
                    className={`w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${errors.document ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={formData.document}
                    onChange={(e) => {
                      setFormData({ ...formData, document: maskDocument(e.target.value) });
                      if (errors.document) setErrors(prev => ({ ...prev, document: false }));
                    }}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4">
                <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Endereço de Entrega</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">CEP (8 dígitos)</label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={8}
                        className={`w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${isLoadingCep ? 'opacity-50' : ''}`}
                        placeholder="00000000"
                        value={formData.cep}
                        onChange={handleCepChange}
                      />
                      {isLoadingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Logradouro (Rua)</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Rua, Avenida, etc"
                      value={formData.logradouro}
                      onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Número</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="123"
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Complemento</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Apto, Bloco, etc"
                      value={formData.complemento}
                      onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Bairro</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Bairro"
                      value={formData.bairro}
                      onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Cidade</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Cidade"
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">UF / Estado</label>
                    <input
                      type="text"
                      maxLength={2}
                      className="w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium uppercase text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="SP"
                      value={formData.uf}
                      onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Footer buttons removed as per request */}
            </form>
          </div>
        </div>
      )}

      <CustomAlert
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />
    </div>
  );
};

export default CRM;
