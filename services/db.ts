import { Client, Product, Order, User, AuditLog, InventoryItem, RecipeItem, DeliveryDriver, OrderStatus, SaleType, TableSession, OrderItem, Waiter, InventoryMovement, OrderRejection, CashSession } from '../types';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';
const AUTH_KEY = 'delivery_fast_auth';

export interface BusinessSettings {
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  deliveryFee: string;
  tableCount: number;
  restaurantLat?: number;
  restaurantLng?: number;
  geofenceRadius?: number;
  isManuallyClosed: boolean;
  operatingHours: string;
  maxChange?: number;
}


const DEFAULT_SETTINGS: BusinessSettings = {
  name: 'Fast Food Express',
  cnpj: '12.345.678/0001-90',
  address: 'Av. Paulista, 1000 - São Paulo, SP',
  phone: '(11) 98888-7777',
  deliveryFee: 'R$ 8,00',
  tableCount: 10,
  geofenceRadius: 30,
  isManuallyClosed: false,
  operatingHours: '[]',
  maxChange: 191
};

class APIDBService {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro na requisição');
    }

    return response.json();
  }

  // Waiters
  public async getWaiters(): Promise<Waiter[]> { return this.request<Waiter[]>('/waiters'); }
  public async saveWaiter(waiter: Waiter) { await this.request('/waiters', { method: 'POST', body: JSON.stringify(waiter) }); }
  public async deleteWaiter(id: string) { await this.request(`/waiters/${id}`, { method: 'DELETE' }); }

  // Table Management
  public async getTableSessions(): Promise<TableSession[]> { return this.request<TableSession[]>('/tables'); }
  public async saveTableSession(session: TableSession, isRejection: boolean = false) {
    await this.request(`/tables?${isRejection ? 'rejection=true' : ''}`, { method: 'POST', body: JSON.stringify(session) });
  }
  public async deleteTableSession(tableNumber: number, isCancellation: boolean = false) {
    await this.request(`/tables/${tableNumber}${isCancellation ? '?cancellation=true' : ''}`, { method: 'DELETE' });
  }

  public async logAction(user: User | null, action: AuditLog['action'], details: string) {
    await this.request('/audit', {
      method: 'POST',
      body: JSON.stringify({ user, action, details })
    });
  }

  public async resetDatabase(): Promise<void> {
    await this.request('/maintenance/reset', { method: 'POST' });
    localStorage.removeItem(AUTH_KEY);
  }

  getCurrentSession(): { user: User; timestamp: number } | null {
    const saved = localStorage.getItem(AUTH_KEY);
    return saved ? JSON.parse(saved) : null;
  }

  public async login(email: string, pass: string): Promise<User | null> {
    try {
      const user = await this.request<User>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass })
      });
      if (user) {
        localStorage.setItem(AUTH_KEY, JSON.stringify({ user, timestamp: Date.now() }));
        return user;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  public async verifyAdminPassword(password: string): Promise<boolean> {
    try {
      const resp = await this.request<{ valid: boolean }>('/auth/verify-admin', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      return resp.valid;
    } catch (e) {
      return false;
    }
  }

  public async logout() {
    const session = this.getCurrentSession();
    if (session) {
      await this.request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ userId: session.user.id })
      });
    }
    localStorage.removeItem(AUTH_KEY);
  }

  // Drivers
  public async getDrivers(): Promise<DeliveryDriver[]> { return this.request<DeliveryDriver[]>('/drivers'); }
  public async saveDriver(driver: DeliveryDriver) { await this.request('/drivers', { method: 'POST', body: JSON.stringify(driver) }); }
  public async deleteDriver(id: string) { await this.request(`/drivers/${id}`, { method: 'DELETE' }); }

  // Inventory
  public async getInventory(): Promise<InventoryItem[]> { return this.request<InventoryItem[]>('/inventory'); }
  public async saveInventoryItem(item: InventoryItem) { await this.request('/inventory', { method: 'POST', body: JSON.stringify(item) }); }
  public async deleteInventoryItem(id: string) { await this.request(`/inventory/${id}`, { method: 'DELETE' }); }

  // Products
  public async getProducts(): Promise<Product[]> { return this.request<Product[]>('/products'); }
  public async saveProduct(product: Product) { await this.request('/products', { method: 'POST', body: JSON.stringify(product) }); }
  public async deleteProduct(id: string) { await this.request(`/products/${id}`, { method: 'DELETE' }); }
  public async updateProductRecipe(productId: string, recipe: RecipeItem[]) {
    const products = await this.getProducts();
    const prod = products.find(p => p.id === productId);
    if (prod) {
      prod.recipe = recipe;
      await this.saveProduct(prod);
    }
  }

  // Orders
  public async getOrders(): Promise<Order[]> { return this.request<Order[]>('/orders'); }

  public async validateStockForOrder(items: { productId: string, quantity: number }[]): Promise<{ valid: boolean, message?: string }> {
    const inventory = await this.getInventory();
    const products = await this.getProducts();

    for (const item of items) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod?.recipe) continue;
      for (const r of prod.recipe) {
        const invI = inventory.find(i => i.id === r.inventoryItemId);
        if (invI) {
          const needed = r.quantity * item.quantity * r.wasteFactor;
          if (invI.quantity < needed) return { valid: false, message: `Falta ${invI.name}` };
        }
      }
    }
    return { valid: true };
  }

  // Deduct stock is now handled on the backend within the saveOrder transaction
  public async saveOrder(order: Order, user: User) {
    await this.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ order, user })
    });
  }

  public async updateOrderStatus(orderId: string, status: OrderStatus, user: User, driverId?: string) {
    await this.request(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, driverId, user })
    });
  }

  public async getOrderById(id: string): Promise<Order> {
    return this.request<Order>(`/orders/${id}`);
  }

  public async updateOrderItems(id: string, items: { productId: string, quantity: number, price: number, observations?: string }[], user: User): Promise<Order> {
    return this.request<Order>(`/orders/${id}/items`, {
      method: 'PUT',
      body: JSON.stringify({ items, user })
    });
  }

  public async updateOrderPaymentMethod(orderId: string, paymentMethod: string, user: User) {
    await this.request(`/orders/${orderId}/payment`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentMethod, user })
    });
  }

  public async deleteOrder(id: string, user: User, reason?: string) {
    await this.request(`/orders/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ user, reason })
    });
  }

  // Settings
  public async getSettings(): Promise<BusinessSettings> {
    try {
      const settings = await this.request<BusinessSettings>('/settings');
      return settings || DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  }

  public async getStoreOperationalStatus(): Promise<{ status: 'online' | 'offline', is_manually_closed: boolean, next_status_change: string | null }> {
    try {
      // Use the public endpoint which calculates logic based on operating hours
      return await this.request('/public/store-status');
    } catch (e) {
      return { status: 'offline', is_manually_closed: true, next_status_change: null };
    }
  }

  public async saveSettings(s: BusinessSettings) {
    await this.request('/settings', { method: 'POST', body: JSON.stringify(s) });
  }

  // Users & CRM
  public async getUsers(): Promise<User[]> { return this.request<User[]>('/users'); }
  public async saveUser(u: User) { await this.request('/users', { method: 'POST', body: JSON.stringify(u) }); }
  public async deleteUser(id: string) { await this.request(`/users/${id}`, { method: 'DELETE' }); }

  public async getClients(): Promise<Client[]> { return this.request<Client[]>('/clients'); }
  public async saveClient(c: Client) { await this.request('/clients', { method: 'POST', body: JSON.stringify(c) }); }
  public async deleteClient(id: string, user: User) {
    await this.request(`/clients/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ user })
    });
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    return this.request<AuditLog[]>('/audit');
  }

  public async getInventoryMovements(startDate?: string, endDate?: string): Promise<InventoryMovement[]> {
    let path = '/inventory/movements';
    const params = new URLSearchParams();
    if (startDate) params.append('start', startDate);
    if (endDate) params.append('end', endDate);
    if (params.toString()) path += `?${params.toString()}`;
    return this.request<InventoryMovement[]>(path);
  }

  // Chat
  public async getChatHistory(driverId: string): Promise<any[]> {
    return this.request<any[]>(`/chat/${driverId}`);
  }

  public async sendChatMessage(message: { driverId: string, content: string, senderName: string, isFromDriver: boolean }) {
    return this.request('/chat', {
      method: 'POST',
      body: JSON.stringify(message)
    });
  }

  public async getRejections(): Promise<OrderRejection[]> {
    return this.request<OrderRejection[]>('/drivers/rejections');
  }

  // Cash Session
  public async getActiveCashSession(): Promise<CashSession | null> {
    try {
      return await this.request<CashSession>('/cash/status');
    } catch (e) {
      return null;
    }
  }

  public async openCashSession(initialBalance: number, user: User): Promise<CashSession> {
    return this.request<CashSession>('/cash/open', {
      method: 'POST',
      body: JSON.stringify({ initialBalance, user })
    });
  }

  public async closeCashSession(sessionId: string, reports: { cash: number, pix: number, credit: number, debit: number, others?: number, observations?: string }, user: User): Promise<CashSession> {
    return this.request<CashSession>(`/cash/close`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, ...reports, user })
    });
  }

  public async getClosurePreview(): Promise<{ systemCash: number, systemPix: number, systemCredit: number, systemDebit: number, totalSales: number }> {
    return this.request<{ systemCash: number, systemPix: number, systemCredit: number, systemDebit: number, totalSales: number }>('/cash/preview');
  }

  public async updateCashSession(data: { id: string, cash: number, pix: number, credit: number, debit: number, others?: number, observations?: string, user: User }): Promise<CashSession> {
    return this.request<CashSession>('/cash/update', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async getCashSessions(startDate?: string, endDate?: string): Promise<CashSession[]> {
    let path = '/cash/list';
    const params = new URLSearchParams();
    if (startDate) params.append('start', startDate);
    if (endDate) params.append('end', endDate);
    if (params.toString()) path += `?${params.toString()}`;
    return this.request<CashSession[]>(path);
  }

  public async reopenCashSession(sessionId: string, user: User): Promise<CashSession> {
    return this.request<CashSession>('/cash/reopen', {
      method: 'POST',
      body: JSON.stringify({ sessionId, user })
    });
  }

  // Feedbacks
  public async getFeedbacks(): Promise<any[]> {
    return this.request<any[]>('/public/feedback');
  }

  // Receivables (Fiado)
  public async getReceivables(): Promise<any[]> {
    return this.request<any[]>('/receivables');
  }

  public async receivePayment(id: string, paymentMethod: string, user: User): Promise<any> {
    return this.request(`/receivables/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethod, user })
    });
  }

  public async deleteReceivable(id: string, user: User): Promise<any> {
    return this.request(`/receivables/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ user })
    });
  }

  public async updateReceivable(id: string, data: any): Promise<any> {
    return this.request(`/receivables/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async verifyRecoveryCode(email: string, recoveryCode: string): Promise<boolean> {
    try {
      const resp = await this.request<{ valid: boolean }>('/auth/recovery/verify', {
        method: 'POST',
        body: JSON.stringify({ email, recoveryCode })
      });
      return resp.valid;
    } catch (e) {
      return false;
    }
  }

  public async resetPassword(data: { email: string, recoveryCode: string, newPassword: string }): Promise<any> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

export const db = new APIDBService();
