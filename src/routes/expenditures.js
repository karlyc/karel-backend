// src/routes/expenditures.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/expenditures?month=1&year=2025&type=MENSUAL
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { month, year, type } = req.query;
  const where = {};
  if (month) where.month = Number(month);
  if (year)  where.year  = Number(year);
  if (type)  where.type  = type;
  try {
    const items = await prisma.expenditure.findMany({ where, orderBy: { date: 'desc' } });
    const total = items.reduce((s, e) => s + Number(e.amount), 0);
    res.json({ items, total });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const d = new Date(req.body.date || new Date());
  const data = {
    ...req.body,
    date: d,
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    amount: parseFloat(req.body.amount),
  };
  try {
    const item = await prisma.expenditure.create({ data });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.expenditure.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
