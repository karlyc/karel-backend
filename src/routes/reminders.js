// src/routes/reminders.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

// GET /api/reminders/upcoming — reminders within next 7 days (for dashboard)
router.get('/upcoming', requireAuth, async (req, res) => {
  const now = new Date();
  const future = new Date(); future.setDate(future.getDate() + 7);
  try {
    const reminders = await prisma.reminder.findMany({
      where: { eventDate: { gte: now, lte: future }, notified: false },
      orderBy: { eventDate: 'asc' },
    });
    res.json(reminders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reminders — all
router.get('/', requireAuth, async (req, res) => {
  try {
    const reminders = await prisma.reminder.findMany({ orderBy: { eventDate: 'asc' } });
    res.json(reminders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
