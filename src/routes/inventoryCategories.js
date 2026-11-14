// src/routes/inventoryCategories.js — categories & subcategories for Inventario
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');

// Matches the categories that were previously hardcoded in the frontend —
// seeded once so existing items' `category` string stays meaningful.
const DEFAULT_CATEGORIES = [
  { name: '🌸 Flores',          code: 'flores',        sortOrder: 1 },
  { name: '🏺 Bases',           code: 'bases',          sortOrder: 2 },
  { name: '🎀 Papel Coreano',   code: 'papel_coreano',  sortOrder: 3 },
  { name: '✂️ Elaboración',    code: 'elaboracion',    sortOrder: 4 },
  { name: '🍷 Botella de Vino', code: 'botella_vino',   sortOrder: 5 },
  { name: '🧸 Peluches',        code: 'peluches',       sortOrder: 6 },
  { name: '📦 Otro',            code: 'otro',           sortOrder: 7 },
];

// GET /api/inventory-categories — lazy-seeds the 7 defaults on first use
router.get('/', requireAuth, async (req, res) => {
  try {
    const count = await prisma.inventoryCategory.count();
    if (count === 0) {
      await prisma.inventoryCategory.createMany({ data: DEFAULT_CATEGORIES });
      // One-time backfill: point existing items' new categoryId at the matching
      // freshly-seeded category, using the legacy `category` code string to match.
      const seeded = await prisma.inventoryCategory.findMany({ where: { code: { not: null } } });
      await Promise.all(seeded.map(cat =>
        prisma.inventoryItem.updateMany({ where: { category: cat.code, categoryId: null }, data: { categoryId: cat.id } })
      ));
    }
    const categories = await prisma.inventoryCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(categories);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/inventory-categories
router.post('/', requireAuth, requireOffice, async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
    const maxSort = await prisma.inventoryCategory.aggregate({ _max: { sortOrder: true } });
    const category = await prisma.inventoryCategory.create({
      data: { name, sortOrder: (maxSort._max.sortOrder || 0) + 1 },
    });
    res.status(201).json(category);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/inventory-categories/:id — rename / reorder
router.patch('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name.trim();
    if (req.body.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder);
    const category = await prisma.inventoryCategory.update({ where: { id: req.params.id }, data });
    res.json(category);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/inventory-categories/:id — only when empty (no items referencing it)
router.delete('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    const itemCount = await prisma.inventoryItem.count({ where: { categoryId: req.params.id } });
    if (itemCount > 0) return res.status(400).json({ error: 'Hay artículos usando esta categoría — reasígnalos primero' });
    await prisma.inventorySubcategory.deleteMany({ where: { categoryId: req.params.id } });
    await prisma.inventoryCategory.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/inventory-categories/:categoryId/subcategories
router.post('/:categoryId/subcategories', requireAuth, requireOffice, async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
    const maxSort = await prisma.inventorySubcategory.aggregate({
      where: { categoryId: req.params.categoryId },
      _max: { sortOrder: true },
    });
    const subcategory = await prisma.inventorySubcategory.create({
      data: { name, categoryId: req.params.categoryId, sortOrder: (maxSort._max.sortOrder || 0) + 1 },
    });
    res.status(201).json(subcategory);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/inventory-categories/subcategories/:id — rename / reorder
router.patch('/subcategories/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name.trim();
    if (req.body.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder);
    const subcategory = await prisma.inventorySubcategory.update({ where: { id: req.params.id }, data });
    res.json(subcategory);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/inventory-categories/subcategories/:id — only when empty
router.delete('/subcategories/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    const itemCount = await prisma.inventoryItem.count({ where: { subcategoryId: req.params.id } });
    if (itemCount > 0) return res.status(400).json({ error: 'Hay artículos usando esta subcategoría — reasígnalos primero' });
    await prisma.inventorySubcategory.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
