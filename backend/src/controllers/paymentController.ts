import { Request, Response } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import prisma from '../prisma';

export const createPreference = async (req: Request, res: Response) => {
    try {
        const { items, total, orderType, clientName } = req.body;

        const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!mpAccessToken) {
            return res.status(500).json({ error: 'MERCADOPAGO_ACCESS_TOKEN is missing on server.' });
        }

        const client = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 10000 } });
        const preference = new Preference(client);

        const mpItems = items.map((i: any) => ({
            id: i.productId,
            title: i.name || 'Produto',
            quantity: i.quantity,
            unit_price: i.price,
            currency_id: 'BRL',
        }));

        // Force a total match by comparing items sum against reported total
        const itemsTotal = mpItems.reduce((acc: number, curr: any) => acc + (curr.unit_price * curr.quantity), 0);

        // If there's missing values like deliveryFee, inject a trailing item
        if (total > itemsTotal) {
            mpItems.push({
                id: 'TAXA_GERAL',
                title: 'Taxas Adicionais (Entrega / Serviço)',
                quantity: 1,
                unit_price: Number((total - itemsTotal).toFixed(2)),
                currency_id: 'BRL',
            });
        }

        // Webhook URL configuration from Environment
        const serverUrl = process.env.VITE_API_URL?.replace('/api', '') || 'https://deleivery-fast-backend.onrender.com';

        const prefBody = {
            items: mpItems,
            notification_url: `${serverUrl}/api/payments/webhook`,
            external_reference: `${Date.now()}-${clientName}`, // Will be updated on Order save
            payment_methods: {
                excluded_payment_methods: [],
                excluded_payment_types: [{ id: "ticket" }], // Blocks Boleto (Slow)
                installments: 3
            },
            back_urls: {
                success: 'https://cardapio-fast-delivery.onrender.com?status=approved',
                failure: 'https://cardapio-fast-delivery.onrender.com?status=failure',
                pending: 'https://cardapio-fast-delivery.onrender.com?status=pending'
            },
            auto_return: "approved"
        };

        const result = await preference.create({ body: prefBody as any });

        res.json({ id: result.id, init_point: result.init_point });
    } catch (error: any) {
        console.error('MP Create Preference Error:', error);
        res.status(500).json({ error: 'Erro ao gerar o Checkpoint do Mercado Pago.' });
    }
};

export const receiveWebhook = async (req: Request, res: Response) => {
    try {
        const { type, data, action } = req.body;

        // Mercado pago sometimes sends action=payment.created, etc
        if (type === 'payment' || action?.includes('payment')) {
            const paymentId = data?.id;
            if (!paymentId) {
                return res.status(200).send('OK (No ID)');
            }

            const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
            if (!mpAccessToken) return res.status(200).send('No token');

            const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
            const paymentClient = new Payment(client);

            const paymentInfo = await paymentClient.get({ id: paymentId });

            const { status, additional_info, external_reference, order } = paymentInfo;

            // In a perfect world, we identify the Order precisely by mpPreferenceId
            // Or via external_reference (which we set to be the actual internal Order ID or temp ticket)
            const targetOrder = await prisma.order.findFirst({
                where: {
                    OR: [
                        { id: external_reference }, // If we manage to pass the actual ID early
                        { mpPreferenceId: paymentId } // Or searching by preference map
                    ]
                }
            });

            if (targetOrder && targetOrder.paymentStatus !== 'APPROVED') {
                if (status === 'approved') {
                    // Mudar status e disparar pro frontend
                    await prisma.order.update({
                        where: { id: targetOrder.id },
                        data: {
                            paymentStatus: 'APPROVED',
                            mpPaymentId: paymentId?.toString(),
                            status: 'PREPARING' // Transfere do AGUARDANDO PAGAMENTO na loja
                        }
                    });

                    // Avisar os sockets logados (Painel e Cozinha)
                    import('../socket').then(({ getIO }) => {
                        getIO().emit('ordersUpdated');
                        getIO().emit('newOrderAlert', { id: targetOrder.id, message: `Pagamento Online Aprovado: ${targetOrder.id}` });
                    });
                } else if (status === 'rejected' || status === 'cancelled') {
                    await prisma.order.update({
                        where: { id: targetOrder.id },
                        data: {
                            paymentStatus: status.toUpperCase(),
                            mpPaymentId: paymentId?.toString()
                        }
                    });

                    import('../socket').then(({ getIO }) => {
                        getIO().emit('ordersUpdated');
                    });
                }
            }
        }

        res.status(200).send('Webhook Received');
    } catch (error) {
        console.error('MP Webhook Error:', error);
        res.status(500).send('Webhook Processing Error');
    }
};
