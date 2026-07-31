import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const products = [
  {
    slug: 'audifonos-inalambricos',
    name: 'Audífonos inalámbricos',
    description: 'Audio nítido, estuche de carga y hasta 24 horas de batería.',
    price: 129_900,
    stock: 100,
    isFeatured: true,
  },
  {
    slug: 'parlante-bluetooth',
    name: 'Parlante Bluetooth',
    description:
      'Sonido portátil, resistente a salpicaduras y 12 horas de batería.',
    price: 89_900,
    stock: 100,
    isFeatured: false,
  },
  {
    slug: 'teclado-mecanico',
    name: 'Teclado mecánico',
    description: 'Teclas retroiluminadas, conexión USB-C y respuesta precisa.',
    price: 179_900,
    stock: 100,
    isFeatured: false,
  },
  {
    slug: 'reloj-inteligente',
    name: 'Reloj inteligente',
    description:
      'Monitoreo deportivo, notificaciones y pantalla de alta definición.',
    price: 219_900,
    stock: 100,
    isFeatured: false,
  },
];

try {
  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: product,
      create: product,
    });
  }
} finally {
  await prisma.$disconnect();
}
