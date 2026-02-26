
import React, { useState, useEffect } from 'react';
import { Client, User } from '../types';
import { db } from '../services/db';
import CustomAlert from '../components/CustomAlert';
import { validateEmail, validateCPF, validateCNPJ, maskPhone, maskDocument, toTitleCase } from '../services/validationUtils';

interface CRMProps {
  currentUser: User;
}

const CRM: React.FC<CRMProps> = ({ currentUser }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isLoadingCep, setIsLoadingCep] = useState(false);

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
    const addr = client.addresses[0] || '';
    setFormData({
      name: client.name,
      phone: client.phone,
      email: client.email || '',
      document: client.document || '',
      cep: '',
      logradouro: addr,
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!currentUser.permissions.includes('admin')) {
      showAlert('Acesso Negado', 'Apenas o Administrador Master pode excluir clientes.', 'DANGER');
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
          showAlert('Sucesso', 'Cliente removido com sucesso!', 'SUCCESS');
        } catch (error: any) {
          showAlert('Erro na Exclusão', error.message || 'Erro ao remover cliente.', 'DANGER');
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
        showAlert('CEP Inválido', 'CEP não encontrado.', 'INFO');
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
      showAlert('Erro de Conexão', 'Não foi possível conectar ao serviço de busca de CEP. Por favor, preencha manualmente.', 'DANGER');
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
      showAlert('Campos Inválidos', 'Verifique os campos destacados em vermelho.', 'DANGER');
      return;
    }

    if (formData.email && !validateEmail(formData.email)) {
      setErrors({ email: true });
      showAlert('Email Inválido', 'Por favor, insira um endereço de email válido.', 'DANGER');
      return;
    }

    const fullAddress = `${formData.logradouro}, ${formData.numero}${formData.complemento ? ' - ' + formData.complemento : ''}, ${formData.bairro}, ${formData.cidade} - ${formData.uf} (CEP: ${formData.cep})`;

    const clientData: Client = {
      id: editingClient?.id || Date.now().toString(),
      name: toTitleCase(formData.name),
      phone: formData.phone,
      email: formData.email || undefined,
      document: formData.document || undefined,
      addresses: [fullAddress],
      totalOrders: editingClient?.totalOrders || 0,
      lastOrderDate: editingClient?.lastOrderDate || '-'
    };

    await db.saveClient(clientData);
    refreshClients();
    setIsModalOpen(false);
    setErrors({});
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden relative">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Cliente
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Telefone</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Endereço Principal</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Pedidos</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length > 0 ? filtered.map(client => (
              <tr key={client.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-800">{client.name}</p>
                  <p className="text-xs text-slate-400">Último: {client.lastOrderDate || '-'}</p>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{client.phone}</td>
                <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{client.addresses[0] || 'Nenhum endereço'}</td>
                <td className="px-6 py-4">
                  <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg text-xs font-bold">
                    {client.totalOrders}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEditModal(client)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Editar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">
                {editingClient ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.name ? 'text-red-500' : 'text-slate-500'}`}>Nome Completo *</label>
                  <input
                    type="text"
                    required
                    className={`w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.name ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="Ex: João da Silva"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: toTitleCase(e.target.value) });
                      if (errors.name) setErrors(prev => ({ ...prev, name: false }));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.phone ? 'text-red-500' : 'text-slate-500'}`}>Telefone / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    className={`w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.phone ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="Ex: (11) 9 9999-9999"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({ ...formData, phone: maskPhone(e.target.value) });
                      if (errors.phone) setErrors(prev => ({ ...prev, phone: false }));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.email ? 'text-red-500' : 'text-slate-500'}`}>Email</label>
                  <input
                    type="email"
                    className={`w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.email ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="Ex: joao@email.com"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (errors.email) setErrors(prev => ({ ...prev, email: false }));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-bold uppercase ${errors.document ? 'text-red-500' : 'text-slate-500'}`}>CPF / CNPJ</label>
                  <input
                    type="text"
                    className={`w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.document ? 'ring-2 ring-red-500 animate-shake' : ''}`}
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={formData.document}
                    onChange={(e) => {
                      setFormData({ ...formData, document: maskDocument(e.target.value) });
                      if (errors.document) setErrors(prev => ({ ...prev, document: false }));
                    }}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Endereço de Entrega</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">CEP (8 dígitos)</label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={8}
                        className={`w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium ${isLoadingCep ? 'opacity-50' : ''}`}
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
                    <label className="text-xs font-bold text-slate-500 uppercase">Logradouro (Rua)</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                      placeholder="Rua, Avenida, etc"
                      value={formData.logradouro}
                      onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Número</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                      placeholder="123"
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-bold text-slate-500 uppercase">Complemento</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                      placeholder="Apto, Bloco, etc"
                      value={formData.complemento}
                      onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Bairro</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                      placeholder="Bairro"
                      value={formData.bairro}
                      onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Cidade</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                      placeholder="Cidade"
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">UF / Estado</label>
                    <input
                      type="text"
                      maxLength={2}
                      className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium uppercase"
                      placeholder="SP"
                      value={formData.uf}
                      onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                >
                  Salvar Cliente
                </button>
              </div>
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
