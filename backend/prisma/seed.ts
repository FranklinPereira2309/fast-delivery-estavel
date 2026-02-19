import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const adminEmail = 'admin@admin.com'

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Administrador Master',
      password: 'admin', // Altere após o primeiro acesso
      permissions: [
        'dashboard',
        'pos',
        'sales-monitor',
        'tables',
        'kitchen',
        'crm',
        'inventory',
        'logistics',
        'settings'
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
