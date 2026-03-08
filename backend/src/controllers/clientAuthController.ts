import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_delivery_fast';

export const registerClient = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        let { name, email, phone, password, cep, street, addressNumber, neighborhood, city, state, complement } = req.body;

        if (phone) phone = phone.replace(/\D/g, '');

        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Nome, celular e senha são obrigatórios.' });
        }

        // Check if client with this phone or email already exists
        const existingClient = await prisma.client.findFirst({
            where: {
                OR: [
                    { phone },
                    (email && email.trim() !== '') ? { email } : {}
                ]
            }
        });

        if (existingClient) {
            const field = existingClient.phone === phone ? 'Telefone' : 'E-mail';
            return res.status(409).json({ message: `${field} já em uso. Por favor, substitua os dados informados ou efetue a recuperação de conta.` });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const pin = Math.floor(1000 + Math.random() * 9000).toString();

        const fullAddress = [
            [street, addressNumber, complement].filter(Boolean).join(', '),
            [neighborhood, city, state?.toUpperCase()].filter(Boolean).join(', ')
        ].filter(Boolean).join(' - ');

        const newClient = await prisma.client.create({
            data: {
                name,
                phone,
                email,
                password: hashedPassword,
                pin,
                cep,
                street,
                addressNumber,
                neighborhood,
                city,
                state,
                complement,
                addresses: fullAddress ? [fullAddress] : []
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

        const isDefaultPassword = await bcrypt.compare('123', client.password);
        const clientResponse = {
            ...client,
            mustChangePassword: isDefaultPassword
        };

        const token = jwt.sign({ id: client.id, role: 'CLIENT' }, JWT_SECRET, { expiresIn: '30d' });

        // Create a log entry
        await prisma.auditLog.create({
            data: {
                userId: client.id,
                userName: client.name,
                action: 'LOGIN_CLIENT',
                details: `Cliente ${client.name} acessou o delivery app.`
            }
        });

        res.json({ token, client: clientResponse });
    } catch (error) {
        console.error('Login Client Error:', error);
        res.status(500).json({ message: 'Erro interno' });
    }
};

export const updateClientProfile = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const id = req.params.id as string;
        const { name, email, phone, addresses, cep, street, addressNumber, neighborhood, city, state, complement, currentPassword, password } = req.body;

        const client = await prisma.client.findUnique({
            where: { id }
        });

        if (!client || !client.password) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        // Se for enviado uma nova senha, a senha atual passa a ser obrigatória para autenticação da troca.
        if (password) {
            if (!currentPassword) {
                return res.status(401).json({ error: 'Senha atual é obrigatória para realizar a troca de senhas.' });
            }
            const valid = await bcrypt.compare(currentPassword, client.password);
            if (!valid) {
                return res.status(401).json({ error: 'Senha atual incorreta.' });
            }
        }

        const data: any = {};
        if (name) data.name = name;
        if (email) data.email = email;
        if (phone) data.phone = phone.replace(/\D/g, '');
        if (addresses) data.addresses = addresses;
        if (cep) data.cep = cep;
        if (street) data.street = street;
        if (addressNumber) data.addressNumber = addressNumber;
        if (neighborhood) data.neighborhood = neighborhood;
        if (city) data.city = city;
        if (state) data.state = state;
        if (complement) data.complement = complement;

        // Auto-generate addresses array if structured fields are provided and addresses is not explicitly sent
        if (!addresses && (street || addressNumber || neighborhood || city || state)) {
            const current = client;
            const s = street || current.street;
            const n = addressNumber || current.addressNumber;
            const c = complement || current.complement;
            const b = neighborhood || current.neighborhood;
            const ci = city || current.city;
            const st = state || current.state;

            const fullAddress = [
                [s, n, c].filter(Boolean).join(', '),
                [b, ci, st?.toUpperCase()].filter(Boolean).join(', ')
            ].filter(Boolean).join(' - ');

            if (fullAddress) {
                data.addresses = [fullAddress];
            }
        }
        if (password) data.password = await bcrypt.hash(password, 10);

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
    try {
        const { email, phone, newPassword } = req.body;

        if (!email || !phone || !newPassword) {
            return res.status(400).json({ message: 'E-mail, telefone e nova senha são obrigatórios.' });
        }

        const client = await prisma.client.findFirst({
            where: {
                email,
                phone
            }
        });

        if (!client) {
            return res.status(404).json({ message: 'Nenhuma conta encontrada combinando este e-mail associado a este telefone.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.client.update({
            where: { id: client.id },
            data: { password: hashedPassword }
        });

        res.status(200).json({ message: 'Senha redefinida com sucesso. Faça seu login.' });
    } catch (error) {
        console.error('Recover Password Error:', error);
        res.status(500).json({ message: 'Erro ao recuperar senha.' });
    }
};
