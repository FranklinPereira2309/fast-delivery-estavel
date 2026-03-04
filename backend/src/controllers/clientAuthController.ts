
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_delivery_fast';

export const registerClient = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { name, email, phone, password, cep, street, addressNumber, neighborhood, city, state, complement } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Nome, celular e senha são obrigatórios.' });
        }

        // Check if client with this phone or email already exists
        const existingClient = await prisma.client.findFirst({
            where: {
                OR: [
                    { phone },
                    email ? { email } : {}
                ]
            }
        });

        if (existingClient) {
            if (existingClient.password) {
                return res.status(400).json({ message: 'Conta já existe para este número/email.' });
            } else {
                // Upgrade existing manual client to have a password
                const hashedPassword = await bcrypt.hash(password, 10);
                const updated = await prisma.client.update({
                    where: { id: existingClient.id },
                    data: { password: hashedPassword, email: email || existingClient.email, name, cep, street, addressNumber, neighborhood, city, state, complement }
                });
                const token = jwt.sign({ id: updated.id, role: 'CLIENT' }, JWT_SECRET, { expiresIn: '30d' });
                return res.status(200).json({ token, client: updated });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newClient = await prisma.client.create({
            data: {
                name,
                phone,
                email,
                password: hashedPassword,
                cep,
                street,
                addressNumber,
                neighborhood,
                city,
                state,
                complement
            }
        });

        const token = jwt.sign({ id: newClient.id, role: 'CLIENT' }, JWT_SECRET, { expiresIn: '30d' });
        res.status(201).json({ token, client: newClient });
    } catch (error) {
        console.error('Register Client Error:', error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
};

export const loginClient = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { phone, password } = req.body;

        const client = await prisma.client.findFirst({
            where: { phone }
        });

        if (!client || !client.password) {
            return res.status(401).json({ message: 'Credenciais inválidas ou conta não ativada via App.' });
        }

        const valid = await bcrypt.compare(password, client.password);
        if (!valid) {
            return res.status(401).json({ message: 'Senha incorreta.' });
        }

        const token = jwt.sign({ id: client.id, role: 'CLIENT' }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, client });
    } catch (error) {
        console.error('Login Client Error:', error);
        res.status(500).json({ message: 'Erro interno' });
    }
};

export const updateClientProfile = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const id = req.params.id as string;
        const { name, email, address, currentPassword, password } = req.body;

        const client = await prisma.client.findUnique({
            where: { id }
        });

        if (!client || !client.password) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        // Validate current password
        const valid = await bcrypt.compare(currentPassword, client.password);
        if (!valid) {
            return res.status(401).json({ error: 'Senha atual incorreta.' });
        }

        const data: any = {
            name,
            email,
            addresses: [address] // Save the full address string to the addresses array
        };

        if (password) {
            data.password = await bcrypt.hash(password, 10);
        }

        const updatedClient = await prisma.client.update({
            where: { id },
            data
        });

        // Remove password from response
        const { password: _, ...clientWithoutPassword } = updatedClient;
        res.json(clientWithoutPassword);
    } catch (error) {
        console.error('Update Client Profile Error:', error);
        res.status(500).json({ error: 'Erro ao atualizar perfil.' });
    }
};

export const recoverPassword = async (req: ExpressRequest, res: ExpressResponse) => {
    // Skeleton for SMS PIN later
    res.status(501).json({ message: 'Módulo de SMS em desenvolvimento. Contate a loja.' });
};
