import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.product.upsert({
    where: { slug: 'audifonos-inalambricos' },
    update: {},
    create: {
      slug: 'audifonos-inalambricos',
      name: 'Audífonos inalámbricos',
      description: 'Audio nítido, estuche de carga y hasta 24 horas de batería.',
      price: 129_900,
      stock: 10,
      isFeatured: true,
    },
  })
} finally {
  await prisma.$disconnect()
}
