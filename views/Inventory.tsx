
import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem, Product, RecipeItem, OrderItem, UnitType } from '../types';
import { db } from '../services/db';
import { PLACEHOLDER_FOOD_IMAGE, formatImageUrl, Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

const Inventory: React.FC = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [viewMode, setViewMode] = useState<'ESTOQUE' | 'CARDAPIO'>('ESTOQUE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isInvModalOpen, setIsInvModalOpen] = useState(false);
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [invFormData, setInvFormData] = useState({
    name: '', unit: 'G' as UnitType, quantity: 0, minStock: 0, cost: 0
  });

  const [prodFormData, setProdFormData] = useState({
    name: '', price: 0, category: '', imageUrl: '', stock: 0,
    ncm: '', cfop: '', cest: ''
  });

  const [tempRecipe, setTempRecipe] = useState<RecipeItem[]>([]);

  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel?: () => void, type: 'INFO' | 'DANGER' | 'SUCCESS' }>({
    isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'INFO'
  });

  const showAlert = (title: string, message: string, type: 'INFO' | 'DANGER' | 'SUCCESS' = 'INFO', onConfirm?: () => void, onCancel?: () => void) => {
    setAlertConfig({
      isOpen: true, title, message,
      onConfirm: onConfirm || (() => setAlertConfig(prev => ({ ...prev, isOpen: false }))),
      onCancel: onCancel,
      type
    });
  };

  useEffect(() => {
    refreshData();
  }, [viewMode]);

  const refreshData = async () => {
    const [inv, prods] = await Promise.all([db.getInventory(), db.getProducts()]);
    setInventory(inv);
    setProducts(prods);
  };

  const openInvModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setInvFormData({ ...item });
    } else {
      setEditingItem(null);
      setInvFormData({ name: '', unit: 'G', quantity: 0, minStock: 0, cost: 0 });
    }
    setIsInvModalOpen(true);
  };

  const saveInvItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.saveInventoryItem({ id: editingItem?.id || `ins-${Date.now()}`, ...invFormData });
    await refreshData();
    setIsInvModalOpen(false);
  };

  const deleteInvItem = async (id: string) => {
    if (products.some(p => p.recipe?.some(r => r.inventoryItemId === id))) {
      return showAlert("Ação Bloqueada", "Este insumo faz parte de uma receita ativa e não pode ser excluído.", "DANGER");
    }

    showAlert(
      "Confirmar Exclusão",
      "Tem certeza que deseja excluir este insumo permanentemente do estoque?",
      "DANGER",
      async () => {
        await db.deleteInventoryItem(id);
        await refreshData();
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
      },
      () => setAlertConfig(prev => ({ ...prev, isOpen: false }))
    );
  };

  const openProdModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setProdFormData({
        name: product.name,
        price: product.price,
        category: product.category,
        imageUrl: product.imageUrl || '',
        stock: product.stock,
        ncm: product.ncm || '',
        cfop: product.cfop || '',
        cest: product.cest || ''
      });
    } else {
      setEditingProduct(null);
      setProdFormData({ name: '', price: 0, category: 'Geral', imageUrl: '', stock: 0, ncm: '', cfop: '', cest: '' });
    }
    setIsProdModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProdFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.saveProduct({ id: editingProduct?.id || `prod-${Date.now()}`, ...prodFormData, recipe: editingProduct?.recipe || [] });
      await refreshData();
      setIsProdModalOpen(false);
    } catch (error) {
      alert("Erro ao salvar produto. Verifique os dados.");
    }
  };

  const saveRecipe = async () => {
    if (editingProduct) {
      await db.updateProductRecipe(editingProduct.id, tempRecipe);
      await refreshData();
      setIsRecipeModalOpen(false);
    }
  };

  const deleteProd = async (id: string) => {
    showAlert(
      "Confirmar Exclusão",
      "Deseja excluir este produto permanentemente do cardápio?",
      "DANGER",
      async () => {
        await db.deleteProduct(id);
        await refreshData();
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
      },
      () => setAlertConfig(prev => ({ ...prev, isOpen: false }))
    );
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <CustomAlert {...alertConfig} onConfirm={alertConfig.onConfirm} onCancel={alertConfig.onCancel} />
      <div className="flex gap-4 border-b border-slate-200 shrink-0">
        <button onClick={() => setViewMode('ESTOQUE')} className={`pb-4 px-2 font-bold transition-all ${viewMode === 'ESTOQUE' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Estoque de Insumos</button>
        <button onClick={() => setViewMode('CARDAPIO')} className={`pb-4 px-2 font-bold transition-all ${viewMode === 'CARDAPIO' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Cardápio / Ficha Técnica</button>
      </div>

      {viewMode === 'ESTOQUE' ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg">Insumos e Matéria-Prima</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Controle de volumes para produção.</p>
            </div>
            <button onClick={() => openInvModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-blue-100 transition-all">+ Novo Insumo</button>
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left">
              <thead><tr className="border-b text-slate-400 text-[10px] uppercase font-bold tracking-widest"><th className="px-6 py-4">Insumo</th><th className="px-6 py-4">Quantidade</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Ações</th></tr></thead>
              <tbody className="divide-y">{inventory.length > 0 ? inventory.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-700 uppercase text-xs">{item.name}</p>
                    <p className="text-[9px] text-slate-400 font-mono">ID: {item.id}</p>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-600 text-xs">{item.quantity} {item.unit}</td>
                  <td className="px-6 py-4">
                    {item.quantity <= item.minStock ? (
                      <span className="bg-red-50 text-red-600 px-2 py-1 rounded-md text-[9px] font-black uppercase">Crítico</span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md text-[9px] font-black uppercase">Normal</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openInvModal(item)} className="p-2 text-slate-400 hover:text-blue-600" title="Editar"><Icons.Edit /></button>
                      <button onClick={() => deleteInvItem(item.id)} className="p-2 text-slate-300 hover:text-red-500" title="Excluir"><Icons.Delete /></button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-xs italic">Nenhum insumo cadastrado.</td></tr>
              )}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 overflow-y-auto pb-10">
          {products.map(product => (
            <div key={product.id} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 flex flex-col group hover:shadow-xl hover:border-blue-100 transition-all">
              <div className="relative mb-4 bg-slate-50 rounded-3xl overflow-hidden aspect-square flex items-center justify-center border border-slate-50 group-hover:scale-[1.02] transition-transform">
                <img src={formatImageUrl(product.imageUrl)} onError={e => e.currentTarget.src = PLACEHOLDER_FOOD_IMAGE} className="w-full h-full object-contain" />
              </div>
              <h4 className="font-black text-slate-800 text-sm uppercase truncate mb-1">{product.name}</h4>
              <p className="text-lg font-black text-blue-600 mb-6">R$ {product.price.toFixed(2)}</p>
              <div className="flex gap-2">
                <button onClick={() => openProdModal(product)} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2" title="Editar">
                  <Icons.Edit />
                  Editar
                </button>
                <button onClick={() => { setEditingProduct(product); setTempRecipe(product.recipe || []); setIsRecipeModalOpen(true); }} className="flex-1 py-4 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2" title="Ficha Técnica">
                  <Icons.View />
                  Ficha
                </button>
                <button onClick={() => deleteProd(product.id)} className="w-14 py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition-all flex items-center justify-center" title="Excluir">
                  <Icons.Delete />
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => openProdModal()} className="border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400 font-black uppercase gap-2 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-400 transition-all text-[10px] tracking-widest">
            <span className="text-3xl">+</span>
            Adicionar Produto
          </button>
        </div>
      )}

      {/* MODAL INSUMO */}
      {isInvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{editingItem ? 'Editar Insumo' : 'Novo Insumo'}</h3>
              <button onClick={() => setIsInvModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={saveInvItem} className="p-10 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Insumo</label>
                <input type="text" required value={invFormData.name} onChange={e => setInvFormData({ ...invFormData, name: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm" placeholder="Ex: Pão Brioche" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade</label>
                  <select value={invFormData.unit} onChange={e => setInvFormData({ ...invFormData, unit: e.target.value as UnitType })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm">
                    <option value="G">Grama (g)</option>
                    <option value="ML">Mililitro (ml)</option>
                    <option value="UN">Unidade (un)</option>
                    <option value="KG">Quilo (kg)</option>
                    <option value="L">Litro (l)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estoque Atual</label>
                  <input type="number" required step="0.01" value={invFormData.quantity} onChange={e => setInvFormData({ ...invFormData, quantity: parseFloat(e.target.value) })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estoque Mínimo</label>
                  <input type="number" required step="0.01" value={invFormData.minStock} onChange={e => setInvFormData({ ...invFormData, minStock: parseFloat(e.target.value) })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custo Médio</label>
                  <input type="number" required step="0.01" value={invFormData.cost} onChange={e => setInvFormData({ ...invFormData, cost: parseFloat(e.target.value) })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm" />
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">Salvar Insumo</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {isProdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{editingProduct ? 'Editar' : 'Novo'} Produto</h3>
              <button onClick={() => setIsProdModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={saveProduct} className="p-10 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Produto</label>
                <input type="text" placeholder="Ex: Burger Bacon" required value={prodFormData.name} onChange={e => setProdFormData({ ...prodFormData, name: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Preço de Venda</label>
                  <input type="number" step="0.01" placeholder="R$ 0,00" required value={prodFormData.price} onChange={e => setProdFormData({ ...prodFormData, price: parseFloat(e.target.value) })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                  <input type="text" placeholder="Ex: Burgers" value={prodFormData.category} onChange={e => setProdFormData({ ...prodFormData, category: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Imagem do Produto</label>
                <div className="flex gap-2">
                  <input type="text" value={prodFormData.imageUrl} onChange={e => setProdFormData({ ...prodFormData, imageUrl: e.target.value })} className="flex-1 p-4 bg-slate-100 border-none rounded-2xl text-[10px] font-bold" placeholder="URL da imagem..." />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black">UP</button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50 space-y-4">
                <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Informações Fiscais</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NCM</label>
                    <input type="text" placeholder="00000000" value={prodFormData.ncm} onChange={e => setProdFormData({ ...prodFormData, ncm: e.target.value })} className="w-full p-3 bg-slate-50 border-none rounded-xl font-bold text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CFOP</label>
                    <input type="text" placeholder="5102" value={prodFormData.cfop} onChange={e => setProdFormData({ ...prodFormData, cfop: e.target.value })} className="w-full p-3 bg-slate-50 border-none rounded-xl font-bold text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CEST</label>
                    <input type="text" placeholder="0000000" value={prodFormData.cest} onChange={e => setProdFormData({ ...prodFormData, cest: e.target.value })} className="w-full p-3 bg-slate-50 border-none rounded-xl font-bold text-xs" />
                  </div>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsProdModalOpen(false)} className="flex-1 py-4 font-black text-slate-400 uppercase text-[10px]">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-100 uppercase text-[10px] tracking-widest">Salvar Produto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FICHA TÉCNICA - ATUALIZADO COM DESPERDÍCIO */}
      {isRecipeModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Ficha Técnica: {editingProduct.name}</h3>
              <button onClick={() => setIsRecipeModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              {tempRecipe.length > 0 ? tempRecipe.map((item, index) => (
                <div key={index} className="flex gap-3 items-end bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Insumo</label>
                    <select value={item.inventoryItemId} onChange={e => { const updated = [...tempRecipe]; updated[index].inventoryItemId = e.target.value; setTempRecipe(updated); }} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                      <option value="">Selecione...</option>
                      {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>)}
                    </select>
                  </div>
                  <div className="w-20 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Qtd</label>
                    <input type="number" step="0.01" value={item.quantity} onChange={e => { const updated = [...tempRecipe]; updated[index].quantity = parseFloat(e.target.value) || 0; setTempRecipe(updated); }} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                  </div>
                  <div className="w-24 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Desp. (%)</label>
                    <input
                      type="number"
                      step="1"
                      placeholder="0"
                      value={Math.round((item.wasteFactor - 1) * 100)}
                      onChange={e => {
                        const percentage = parseFloat(e.target.value) || 0;
                        const updated = [...tempRecipe];
                        updated[index].wasteFactor = 1 + (percentage / 100);
                        setTempRecipe(updated);
                      }}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                  <button onClick={() => setTempRecipe(tempRecipe.filter((_, i) => i !== index))} className="p-3 text-red-400 hover:bg-red-50 rounded-xl transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
              )) : (
                <p className="text-center text-slate-400 text-xs italic py-10">Nenhum insumo vinculado a esta receita.</p>
              )}
              <button onClick={() => setTempRecipe([...tempRecipe, { inventoryItemId: inventory[0]?.id || '', quantity: 0, wasteFactor: 1 }])} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] hover:text-blue-600 hover:border-blue-200 transition-all">+ Adicionar Insumo à Receita</button>
            </div>
            <div className="p-8 border-t border-slate-50 flex gap-4">
              <button onClick={() => setIsRecipeModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px]">Cancelar</button>
              <button onClick={saveRecipe} className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl uppercase text-[10px] tracking-widest">Atualizar Ficha Técnica</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
