// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Admin staff
  const adminPin = await bcrypt.hash('1234', 10);
  const admin = await prisma.staff.upsert({
    where: { id: 'admin-karel' },
    update: {},
    create: {
      id: 'admin-karel',
      name: 'Karen — Admin',
      pin: adminPin,
      role: 'ADMIN',
      active: true,
    },
  });
  console.log(`✓ Admin staff: ${admin.name}`);

  // Sample staff
  const staffPin = await bcrypt.hash('5678', 10);
  await prisma.staff.createMany({
    skipDuplicates: true,
    data: [
      { name: 'María Rodríguez', pin: staffPin, role: 'OFFICE', active: true },
      { name: 'Carlos Pérez',    pin: staffPin, role: 'FLORISTA', active: true },
      { name: 'Luis Ramos',      pin: staffPin, role: 'REPARTIDOR', active: true },
    ],
  });
  console.log('✓ Sample staff created');

  // Categories
  const categories = await Promise.all([
    prisma.category.upsert({ where: { id: 'cat-rosas' }, update: {}, create: { id: 'cat-rosas', name: 'Rosas', description: 'Arreglos con rosas frescas', visible: true, sortOrder: 1 } }),
    prisma.category.upsert({ where: { id: 'cat-coloridos' }, update: {}, create: { id: 'cat-coloridos', name: 'Coloridos', description: 'Arreglos con flores de colores', visible: true, sortOrder: 2 } }),
    prisma.category.upsert({ where: { id: 'cat-exoticas' }, update: {}, create: { id: 'cat-exoticas', name: 'Exóticas', description: 'Orquídeas y flores exóticas', visible: true, sortOrder: 3 } }),
    prisma.category.upsert({ where: { id: 'cat-funebres' }, update: {}, create: { id: 'cat-funebres', name: 'Fúnebres', description: 'Coronas y arreglos fúnebres', visible: true, sortOrder: 4 } }),
    prisma.category.upsert({ where: { id: 'cat-frutales' }, update: {}, create: { id: 'cat-frutales', name: 'Frutales', description: 'Arreglos con frutas y flores', visible: true, sortOrder: 5 } }),
    prisma.category.upsert({ where: { id: 'cat-caballero' }, update: {}, create: { id: 'cat-caballero', name: 'Caballero', description: 'Arreglos especiales para caballero', visible: true, sortOrder: 6 } }),
  ]);
  console.log('✓ Categories created');

  // Sample products
  await prisma.product.createMany({
    skipDuplicates: true,
    data: [
      { code: 'RC-001', name: 'Rosas Clásicas',      categoryId: 'cat-rosas',     priceStd: 450, priceDlx: 680, pricePrm: 950,  description: 'Docena de rosas rojas frescas con follaje y moño.', visible: true },
      { code: 'BP-002', name: 'Bouquet Primaveral',   categoryId: 'cat-coloridos', priceStd: 680, priceDlx: 950, pricePrm: 1300, description: 'Mezcla de flores de temporada en colores vibrantes.', visible: true },
      { code: 'OD-003', name: 'Orquídeas Deluxe',     categoryId: 'cat-exoticas',  priceStd: 850, priceDlx: 1100, pricePrm: 1500, description: 'Orquídeas Phalaenopsis en maceta de cerámica.', visible: true },
      { code: 'GP-004', name: 'Girasoles Premium',    categoryId: 'cat-coloridos', priceStd: 390, priceDlx: 580, pricePrm: 780,  description: 'Ramo de girasoles con gypsophila y follaje.', visible: true },
      { code: 'CF-005', name: 'Corona Fúnebre',       categoryId: 'cat-funebres',  priceStd: 1200, priceDlx: 1600, pricePrm: 2200, description: 'Corona de flores naturales con listón y dedicatoria.', visible: true },
      { code: 'AF-006', name: 'Arreglo Frutal',       categoryId: 'cat-frutales',  priceStd: 750, priceDlx: 980, pricePrm: 1300, description: 'Canasta con frutas frescas y flores de temporada.', visible: true },
    ],
  });
  console.log('✓ Sample products created');

  console.log('\n🌹 Seed complete!');
  console.log('   Admin PIN: 1234');
  console.log('   Staff PIN:  5678');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
