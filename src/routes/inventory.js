// src/routes/inventory.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
    res.json(items);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, requireOffice, async (req, res) => {
  try {
    const item = await prisma.inventoryItem.create({ data: req.body });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH quantity (add/subtract stock)
router.patch('/:id/stock', requireAuth, async (req, res) => {
  const { delta } = req.body; // positive = add, negative = subtract
  try {
    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: { quantity: { increment: delta } },
    });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
