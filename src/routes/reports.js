// src/routes/reports.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { buildReport, dateRange, getMonthlyReport } = require('../utils/reportBuilder');
const { sendMonthlyReportEmail } = require('../utils/email');

// GET /api/reports/daily?date=2025-01-15
router.get('/daily', requireAuth, requireAdmin, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const where = { createdAt: dateRange(date, date) };
    const report = await buildReport(where);
    res.json({ date, ...report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate daily report' });
  }
});

// GET /api/reports/monthly?year=2025&month=1
router.get('/monthly', requireAuth, requireAdmin, async (req, res) => {
  const year  = Number(req.query.year  || new Date().getFullYear());
  const month = Number(req.query.month || new Date().getMonth() + 1);
  try {
    const result = await getMonthlyReport(year, month);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate monthly report' });
  }
});

// POST /api/reports/monthly/email — manually (re)send the monthly report email.
// Body: { year, month } — defaults to the previous month, matching the automatic
// run that fires on the 1st of each month.
router.post('/monthly/email', requireAuth, requireAdmin, async (req, res) => {
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year  = Number(req.body?.year)  || prevMonthDate.getFullYear();
  const month = Number(req.body?.month) || prevMonthDate.getMonth() + 1;
  try {
    const result = await sendMonthlyReportEmail(year, month);
    if (result.sent === false) return res.status(500).json({ error: result.error });
    res.json({ sent: true, year, month });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/range?from=2025-01-01&to=2025-01-31
router.get('/range', requireAuth, requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });
  try {
    const where = { createdAt: dateRange(from, to) };
    const report = await buildReport(where);
    res.json({ from, to, ...report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate range report' });
  }
});

// GET /api/reports/pending-payments
router.get('/pending-payments', requireAuth, async (req, res) => {
  try {
    const pending = await prisma.order.findMany({
      where: { paymentStatus: 'PENDIENTE', orderStatus: { not: 'CANCELADA' } },
      include: {
        client: { select: { firstName: true, lastNameP: true, phone: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const total = pending.reduce((s,o) => s + Number(o.total), 0);
    res.json({ pending, total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

module.exports = router;
