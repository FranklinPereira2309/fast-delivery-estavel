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

        // 1. Verificar se o usuário já existe no banco (por ID ou E-mail)
        let existingUser = null;
        if (data.id && typeof data.id === 'string' && !data.id.startsWith('user-')) {
            existingUser = await prisma.user.findUnique({ where: { id: data.id } });
        }
        
        if (!existingUser && data.email) {
            existingUser = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
        }

        const userData: any = { ...data };
        
        if (userData.email) {
            userData.email = userData.email.toLowerCase();
        }

        if (existingUser) {
            // Se o usuário JÁ EXISTE (Update)
            // 1. Manter o ID correto do banco
            userData.id = existingUser.id;
            
            // 2. Não resetar a senha a menos que venha uma nova (não-hash)
            if (userData.password && !userData.password.startsWith('$2')) {
                userData.password = await bcrypt.hash(userData.password, 10);
            } else {
                // Se não veio senha nova ou veio hash, removemos para não sobrescrever a atual do banco acidentalmente
                delete userData.password;
            }

            // 3. Manter o status de troca de senha atual do banco, a menos que venha um novo valor explícito
            if (userData.mustChangePassword === undefined) {
                delete userData.mustChangePassword;
            }
        } else {
            // Só aplicamos padrões de "Novo Usuário" se ele REALMENTE não existir no banco
            userData.recoveryCode = userData.recoveryCode || generateRecoveryCode();
            userData.mustChangePassword = userData.mustChangePassword ?? true;
            userData.active = userData.active ?? true;
            
            // Se for novo usuário e não veio senha, ou mesmo se veio, garantimos o hash
            const passwordToHash = userData.password || '123';
            userData.password = await bcrypt.hash(passwordToHash, 10);
            
            // Se o ID for temporário, removemos para o Prisma gerar um UUID
            if (userData.id && typeof userData.id === 'string' && userData.id.startsWith('user-')) {
                delete userData.id;
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

        let user;
        if (existingUser) {
            console.log('Updating existing user:', existingUser.id);
            user = await prisma.user.update({
                where: { id: existingUser.id },
                data: cleanData
            });
        } else {
            console.log('Creating new user with email:', cleanData.email);
            // Garantir que senha existe para criação
            if (!cleanData.password) {
                const passwordToHash = '123';
                cleanData.password = await bcrypt.hash(passwordToHash, 10);
            }
            user = await prisma.user.create({
                data: cleanData
            });
        }
        res.json(user);
    } catch (error: any) {
        console.error('Error in saveUser:', error);
        let errorMessage = error.message;
        
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
