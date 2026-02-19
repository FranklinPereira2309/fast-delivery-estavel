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

  console.log({ admin })
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
