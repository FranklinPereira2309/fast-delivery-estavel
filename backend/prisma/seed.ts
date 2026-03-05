import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()

async function main() {
  const adminEmail = 'admin@admin.com'

  const hashedPassword = await bcrypt.hash('admin123', 10)

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      permissions: [
        'dashboard',
        'pos',
        'sales-monitor',
        'tables',
        'kitchen',
        'crm',
        'inventory',
        'logistics',
        'qrcodes',
        'settings',
        'delivery-orders',
        'receivables',
        'reports'
      ]
    },
    create: {
      email: adminEmail,
      name: 'Administrador Master',
      password: hashedPassword,
      recoveryCode: 'ADMIN1',
      mustChangePassword: true,
      permissions: [
        'dashboard',
        'pos',
        'sales-monitor',
        'tables',
        'kitchen',
        'crm',
        'inventory',
        'logistics',
        'qrcodes',
        'settings',
        'delivery-orders',
        'receivables',
        'reports'
      ]
    },
  })

  const anonymous = await prisma.client.upsert({
    where: { id: 'ANONYMOUS' },
    update: {},
    create: {
      id: 'ANONYMOUS',
      name: 'Consumidor Avulso',
      phone: '0000000000',
      addresses: []
    }
  })

  console.log({ admin, anonymous })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
