import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllCampaigns = async (req: Request, res: Response) => {
    try {
        const campaigns = await prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar campanhas' });
    }
};

export const saveCampaign = async (req: Request, res: Response) => {
    const data = req.body;
    const { user, ...campaignData } = data;

    try {
        const campaign = await prisma.campaign.upsert({
            where: { id: (data.id as string) || '' },
            update: campaignData,
            create: campaignData
        });

        if (user) {
            const isUpdate = !!data.id;
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: isUpdate ? 'UPDATE_CAMPAIGN' : 'CREATE_CAMPAIGN',
                    details: `${isUpdate ? 'Atualizada' : 'Criada'} campanha ${campaign.title}.`
                }
            }).catch(e => console.error('Error creating audit log in saveCampaign:', e));
        }

        res.json(campaign);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao salvar campanha' });
    }
};

export const deleteCampaign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { user } = req.body;

    try {
        const campaign = await prisma.campaign.findUnique({ where: { id: id as string } });
        if (campaign && campaign.status === 'SENT') {
            return res.status(400).json({ message: 'Não é possível excluir uma campanha que já foi enviada.' });
        }

        await prisma.campaign.delete({ where: { id: id as string } });

        if (user) {
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: 'DELETE_CAMPAIGN',
                    details: `Campanha ID ${id} removida.`
                }
            }).catch(e => console.error('Error creating audit log in deleteCampaign:', e));
        }

        res.json({ message: 'Campanha removida com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao remover campanha' });
    }
};

export const sendCampaign = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const campaign = await prisma.campaign.findUnique({ where: { id: id as string } });
        if (!campaign) {
            return res.status(404).json({ message: 'Campanha não encontrada.' });
        }

        if (campaign.status === 'SENT') {
            return res.status(400).json({ message: 'Campanha já enviada.' });
        }

        // Segmenting clients (basic implementation: all active clients)
        const clients = await prisma.client.findMany({
            where: {
                // Here we could apply campaign.segment logic
                // For now, let's just use all active clients with phone/email
            }
        });

        // Trigger notifications (In-app for all clients)
        const notifications = clients.map(client => ({
            clientId: client.id,
            title: campaign.title,
            message: campaign.message,
            isRead: false
        }));

        await prisma.notification.createMany({
            data: notifications
        });

        // Update campaign status
        await prisma.campaign.update({
            where: { id: id as string },
            data: {
                status: 'SENT',
                sentAt: new Date()
            }
        });

        res.json({ message: `Campanha enviada para ${clients.length} clientes.` });
    } catch (error) {
        console.error('Send Campaign Error:', error);
        res.status(500).json({ message: 'Erro ao enviar campanha' });
    }
};
