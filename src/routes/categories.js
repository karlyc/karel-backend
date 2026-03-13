// src/routes/categories.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const where = req.query.visible === 'true' ? { visible: true } : {};
  try {
    const cats = await prisma.category.findMany({
      where, orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    res.json(cats);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch categories' }); }
});

router.post('/', requireAuth, requireOffice, async (req, res) => {
  try {
    const cat = await prisma.category.create({ data: req.body });
    res.status(201).json(cat);
  } catch (err) { res.status(500).json({ error: 'Failed to create category' }); }
});

router.put('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    res.json(cat);
  } catch (err) { res.status(500).json({ error: 'Failed to update category' }); }
});

module.exports = router;
