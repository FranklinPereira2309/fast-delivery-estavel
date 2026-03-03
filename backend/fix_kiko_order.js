const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const orderId = 'TABLE-9-F-1772537099775';
    const waiterId = '1f6a70c3-7e5e-4107-a535-d923b1186aa1'; // Josiane

    try {
        const order = await prisma.order.update({
            where: { id: orderId },
            data: { waiterId: waiterId }
        });
        console.log(`Sucesso: Pedido ${order.id} vinculado a ${order.waiterId} (Josiane).`);
    } catch (error) {
        console.error('Erro ao atualizar pedido:', error);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
