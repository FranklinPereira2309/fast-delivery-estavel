import { Request, Response } from 'express';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

export const getAllUsers = async (req: Request, res: Response) => {
    const users = await prisma.user.findMany();
    const sanitizedUsers = users.map(user => {
        const { password, ...rest } = user;
        return rest;
    });
    res.json(sanitizedUsers);
};

const generateRecoveryCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

export const saveUser = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        console.log('Incoming user data:', JSON.stringify(data));

        // Se o ID começar com 'user-', é um ID temporário do frontend, então tratamos como novo usuário
        const isNewUser = !data.id || (typeof data.id === 'string' && data.id.startsWith('user-'));

        const userData: any = { ...data };
        if (userData.email) {
            userData.email = userData.email.toLowerCase();
        }

        if (isNewUser) {
            userData.recoveryCode = userData.recoveryCode || generateRecoveryCode();
            userData.mustChangePassword = userData.mustChangePassword ?? true;
            userData.active = userData.active ?? true;
            
            // Se for novo usuário e não veio senha, ou mesmo se veio, garantimos o hash
            const passwordToHash = userData.password || '123';
            userData.password = await bcrypt.hash(passwordToHash, 10);
            
            // Remove o ID temporário do frontend para o Prisma gerar um UUID
            if (userData.id && typeof userData.id === 'string' && userData.id.startsWith('user-')) {
                delete userData.id;
            }
        } else {
            // Se for atualização
            if (userData.password && !userData.password.startsWith('$2')) {
                userData.password = await bcrypt.hash(userData.password, 10);
            } else if (!userData.password || userData.password === "") {
                // Se for string vazia ou nula/indefinida, removemos do objeto para não sobrescrever o hash atual
                delete userData.password;
            }
        }

        // Lista de campos permitidos no modelo Prisma User para evitar erros de campo desconhecido
        const allowedFields = [
            'name', 'email', 'password', 'phone', 'recoveryCode', 
            'mustChangePassword', 'active', 'permissions', 'createdAt'
        ];

        const cleanData: any = {};
        allowedFields.forEach(field => {
            if (userData[field] !== undefined) {
                // Conversão de data se necessário
                if (field === 'createdAt' && typeof userData[field] === 'string') {
                    cleanData[field] = new Date(userData[field]);
                } else {
                    cleanData[field] = userData[field];
                }
            }
        });

        // A lógica de busca do upsert deve ser inteligente:
        // 1. Se temos um ID real (UUID), usamos ele.
        // 2. Se o ID é temporário ou nulo, usamos o e-mail como chave única de busca.
        const lookup = (userData.id && typeof userData.id === 'string' && !userData.id.startsWith('user-')) 
            ? { id: userData.id } 
            : { email: cleanData.email };

        console.log('Lookup criteria:', JSON.stringify(lookup));
        console.log('Clean data for Prisma:', JSON.stringify(cleanData));

        const user = await prisma.user.upsert({
            where: lookup,
            update: cleanData,
            create: cleanData
        });
        res.json(user);
    } catch (error: any) {
        console.error('Error in saveUser:', error);
        let errorMessage = error.message;
        
        // Tratamento amigável para erro de constraint única se escapar do upsert (raro)
        if (error.code === 'P2002') {
            errorMessage = 'Já existe um usuário cadastrado com este e-mail.';
        }

        res.status(500).json({ 
            error: `Erro ao salvar usuário: ${errorMessage}`, 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id: id as string } });
    res.json({ message: 'Usuário removido' });
};

export const toggleUserStatus = async (req: Request, res: Response) => {
    const { id, active } = req.body;
    const user = await prisma.user.update({
        where: { id },
        data: { active }
    });
    res.json(user);
};

export const resetUser = async (req: Request, res: Response) => {
    const { id } = req.body;
    const recoveryCode = generateRecoveryCode();
    const hashedPassword = await bcrypt.hash('123', 10);
    const user = await prisma.user.update({
        where: { id },
        data: {
            recoveryCode,
            password: hashedPassword,
            mustChangePassword: true
        }
    });
    res.json(user);
};
