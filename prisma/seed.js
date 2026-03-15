// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Karel database...');

  // ── STAFF (username + 6-digit PIN) ──
  const pins = {
    admin:      await bcrypt.hash('123456', 10),
    office:     await bcrypt.hash('234567', 10),
    florista:   await bcrypt.hash('345678', 10),
    repartidor: await bcrypt.hash('456789', 10),
  };

  await prisma.staff.upsert({
    where: { username: 'admin' },
    update: { pin: pins.admin },
    create: { username: 'admin', name: 'Karen — Admin', pin: pins.admin, role: 'ADMIN', active: true },
  });

  await prisma.staff.upsert({
    where: { username: 'maria' },
    update: { pin: pins.office },
    create: { username: 'maria', name: 'María Rodríguez', pin: pins.office, role: 'OFFICE', active: true },
  });

  await prisma.staff.upsert({
    where: { username: 'carlos' },
    update: { pin: pins.florista },
    create: { username: 'carlos', name: 'Carlos Pérez', pin: pins.florista, role: 'FLORISTA', active: true },
  });

  await prisma.staff.upsert({
    where: { username: 'luis' },
    update: { pin: pins.repartidor },
    create: { username: 'luis', name: 'Luis Ramos', pin: pins.repartidor, role: 'REPARTIDOR', active: true },
  });

  console.log('✓ Staff created');
  console.log('');
  console.log('  Usuario    PIN      Rol');
  console.log('  ─────────────────────────────');
  console.log('  admin      123456   Administrador');
  console.log('  maria      234567   Oficina');
  console.log('  carlos     345678   Florista');
  console.log('  luis       456789   Repartidor');
  console.log('');

  // ── CATEGORIES ──
  const cats = [
    { id: 'cat-rosas',     name: 'Rosas',     sortOrder: 1 },
    { id: 'cat-coloridos', name: 'Coloridos', sortOrder: 2 },
    { id: 'cat-exoticas',  name: 'Exóticas',  sortOrder: 3 },
    { id: 'cat-funebres',  name: 'Fúnebres',  sortOrder: 4 },
    { id: 'cat-frutales',  name: 'Frutales',  sortOrder: 5 },
    { id: 'cat-caballero', name: 'Caballero', sortOrder: 6 },
  ];
  for (const c of cats) {
    await prisma.category.upsert({ where: { id: c.id }, update: {}, create: { ...c, visible: true } });
  }
  console.log('✓ Categories created');

  // ── PRODUCTS (single price, no tiers) ──
  const products = [
    { code: 'RC-001', name: 'Rosas Clásicas',    categoryId: 'cat-rosas',     price: 450,  description: 'Docena de rosas rojas frescas con follaje y moño.', width: 30, height: 40 },
    { code: 'BP-002', name: 'Bouquet Primaveral', categoryId: 'cat-coloridos', price: 680,  description: 'Mezcla de flores de temporada en colores vibrantes.', width: 35, height: 45 },
    { code: 'OD-003', name: 'Orquídeas Deluxe',   categoryId: 'cat-exoticas',  price: 950,  description: 'Orquídeas Phalaenopsis en maceta de cerámica.', width: 25, height: 50 },
    { code: 'GP-004', name: 'Girasoles Premium',  categoryId: 'cat-coloridos', price: 490,  description: 'Ramo de girasoles con gypsophila y follaje.', width: 40, height: 50 },
    { code: 'CF-005', name: 'Corona Fúnebre',     categoryId: 'cat-funebres',  price: 1400, description: 'Corona de flores naturales con listón y dedicatoria.', width: 60, height: 60 },
    { code: 'AF-006', name: 'Arreglo Frutal',     categoryId: 'cat-frutales',  price: 850,  description: 'Canasta con frutas frescas y flores de temporada.', width: 35, height: 35 },
  ];
  for (const p of products) {
    await prisma.product.upsert({ where: { code: p.code }, update: {}, create: { ...p, visible: true } });
  }
  console.log('✓ Products created');

  // ── INVENTORY ──
  const invItems = [
    { name: 'Base de florero grande',   unit: 'pza',   quantity: 15, minStock: 5,  cost: 45 },
    { name: 'Base de florero mediano',  unit: 'pza',   quantity: 20, minStock: 8,  cost: 30 },
    { name: 'Espuma floral (oasis)',     unit: 'pza',   quantity: 30, minStock: 10, cost: 18 },
    { name: 'Listón (rollo)',            unit: 'rollo', quantity: 8,  minStock: 3,  cost: 35 },
    { name: 'Papel celofán',            unit: 'rollo', quantity: 5,  minStock: 2,  cost: 28 },
    { name: 'Alambre floral',           unit: 'rollo', quantity: 4,  minStock: 2,  cost: 22 },
    { name: 'Tarjetas de mensaje',      unit: 'pza',   quantity: 100,minStock: 20, cost: 2  },
    { name: 'Caja de regalo mediana',   unit: 'pza',   quantity: 12, minStock: 5,  cost: 25 },
  ];
  for (const item of invItems) {
    const existing = await prisma.inventoryItem.findFirst({ where: { name: item.name } });
    if (!existing) await prisma.inventoryItem.create({ data: item });
  }
  console.log('✓ Inventory created');

  // ── SAMPLE CLIENT ──
  await prisma.client.upsert({
    where: { phone: '6561234567' },
    update: {},
    create: {
      phone: '6561234567', phoneCode: '+52',
      firstName: 'María', lastNameP: 'González',
      email: 'maria@ejemplo.com', source: 'IN_STORE',
    },
  });
  console.log('✓ Sample client created');

  console.log('\n🌹 Seed complete! Login credentials above ↑');
}

main().catch(console.error).finally(() => prisma.$disconnect());
