// src/routes/closedDates.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');

// GET all closed dates — public so website can fetch them
router.get('/', async (req, res) => {
  try {
    const dates = await prisma.closedDate.findMany({
      orderBy: { date: 'asc' },
    });
    res.json(dates);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST — add a closed date (office+)
router.post('/', requireAuth, requireOffice, async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'Fecha requerida' });
    // Normalize to midnight UTC
    const d = new Date(date + 'T12:00:00Z');
    // Check for duplicate
    const existing = await prisma.closedDate.findFirst({ where: { date: d } });
    if (existing) return res.status(400).json({ error: 'Esta fecha ya está registrada' });
    const record = await prisma.closedDate.create({ data: { date: d, reason: reason || null } });
    res.status(201).json(record);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE — remove a closed date
router.delete('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    await prisma.closedDate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
