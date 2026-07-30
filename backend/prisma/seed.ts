import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
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
  });
}

void main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });
