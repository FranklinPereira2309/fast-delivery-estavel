
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { db } from '../services/db';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [showModalPassword, setShowModalPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    permissions: [] as string[]
  });

  const availableModules = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'pos', label: 'PDV / Vendas' },
    { id: 'tables', label: 'Gestão de Mesas' }, // Adicionado módulo de mesas
    { id: 'kitchen', label: 'Cozinha' },
    { id: 'crm', label: 'Clientes (CRM)' },
    { id: 'inventory', label: 'Estoque / Cardápio' },
    { id: 'logistics', label: 'Logística' },
    { id: 'settings', label: 'Configurações' }
  ];

  useEffect(() => {
    refreshUsers();
  }, []);

  // Fixed: Made refreshUsers async to await DB promise
  const refreshUsers = async () => {
    const allUsers = await db.getUsers();
    setUsers(allUsers);
  };

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({ name: '', email: '', password: '', permissions: ['dashboard'] });
    setShowModalPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: user.password,
      permissions: user.permissions
    });
    setShowModalPassword(false);
    setIsModalOpen(true);
  };

  const handleTogglePermission = (modId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(modId)
        ? prev.permissions.filter(p => p !== modId)
        : [...prev.permissions, modId]
    }));
  };

  const handleTogglePasswordVisibility = (id: string) => {
    const next = new Set(visiblePasswords);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisiblePasswords(next);
  };

  // Fixed: Added async/await for user persistence
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      alert('Nome, Email e Senha são obrigatórios.');
      return;
    }

    const userData: User = {
      id: editingUser?.id || `user-${Date.now()}`,
      name: formData.name,
      email: formData.email,
      password: formData.password,
      permissions: formData.permissions,
      createdAt: editingUser?.createdAt || new Date().toISOString(),
      active: editingUser?.active ?? true
    };

    await db.saveUser(userData);
    refreshUsers();
    setIsModalOpen(false);
  };

  // Fixed: Added async/await for user deletion
  const handleDelete = async (userToDelete: User) => {
    if (userToDelete.permissions.includes('admin')) {
      alert('Não é possível excluir um usuário administrador.');
      return;
    }
    if (confirm(`Deseja excluir o usuário ${userToDelete.name}?`)) {
      await db.deleteUser(userToDelete.id);
      refreshUsers();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Usuários e Permissões (ACL)</h3>
          <p className="text-sm text-slate-500">Gerencie quem pode acessar cada módulo do sistema.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Novo Usuário
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase font-bold tracking-widest">
              <th className="px-6 py-4">Usuário</th>
              <th className="px-6 py-4">E-mail</th>
              <th className="px-6 py-4">Senha</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-white transition-colors group">
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-800">{user.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{user.permissions.join(', ')}</p>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-medium">{user.email}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-receipt text-slate-600">
                      {visiblePasswords.has(user.id) ? user.password : '••••••••'}
                    </span>
                    <button
                      onClick={() => handleTogglePasswordVisibility(user.id)}
                      className="text-slate-300 hover:text-blue-500 transition-colors"
                    >
                      {visiblePasswords.has(user.id) ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditModal(user)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                    {!user.permissions.includes('admin') && (
                      <button onClick={() => handleDelete(user)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Nome Completo</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">E-mail</label>
                  <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Senha</label>
                <div className="relative">
                  <input
                    type={showModalPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="w-full p-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowModalPassword(!showModalPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showModalPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase">Permissões de Módulo</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableModules.map(mod => (
                    <label key={mod.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all border border-transparent has-[:checked]:border-blue-200 has-[:checked]:bg-blue-50">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={formData.permissions.includes(mod.id)}
                        onChange={() => handleTogglePermission(mod.id)}
                      />
                      <span className="text-sm font-semibold text-slate-700">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-100">Salvar Usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
