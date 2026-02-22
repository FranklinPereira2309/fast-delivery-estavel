import { Product } from './types';

// Temporário para UI design antes de ligar o backend
export const MOCK_PRODUCTS: Product[] = [
    {
        id: '1',
        name: 'X-Burger Clássico',
        description: 'Pão brioche macio, blend 160g de fraldinha, muito queijo cheddar derretido e nossa maionese secreta da casa.',
        price: 32.90,
        category: 'Lanches',
        imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=800'
    },
    {
        id: '2',
        name: 'Batata Rústica c/ Cheddar e Bacon',
        description: 'Porção generosa de batatas rústicas fritas na hora, cobertas com fonduta de cheddar e cubos de bacon crocantes.',
        price: 24.50,
        category: 'Porções',
        imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&q=80&w=800'
    },
    {
        id: '3',
        name: 'Refrigerante Cola 350ml',
        description: 'Lata bem gelada.',
        price: 6.00,
        category: 'Bebidas',
        imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=800'
    },
    {
        id: '4',
        name: 'X-Bacon Supremo',
        description: 'Duplo blend bovino, tiras grossas de bacon defumado, cebola caramelizada e molho barbecue.',
        price: 42.90,
        category: 'Lanches',
        imageUrl: 'https://images.unsplash.com/photo-1594212848238-7d71052219ff?auto=format&fit=crop&q=80&w=800'
    },
    {
        id: '5',
        name: 'Milkshake de Morango',
        description: 'Sorvete artesanal batido com calda de morangos frescos e chantilly.',
        price: 18.00,
        category: 'Sobremesas',
        imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968bceed98b?auto=format&fit=crop&q=80&w=800'
    }
];

export const MOCK_CATEGORIES = ['Lanches', 'Porções', 'Bebidas', 'Sobremesas'];

export interface OrderPayload {
    tableNumber: number;
    items: { productId: string; quantity: number }[];
    observations?: string;
}

export const submitOrder = async (payload: OrderPayload) => {
    console.log('Mock: Pedido enviado!', payload);
    return new Promise(resolve => setTimeout(resolve, 1000));
};
