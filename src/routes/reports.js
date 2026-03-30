// src/routes/reports.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Helper: build date range from query
function dateRange(from, to) {
  const start = new Date(from); start.setHours(0,0,0,0);
  const end   = new Date(to);   end.setHours(23,59,59,999);
  return { gte: start, lte: end };
}

// Shared aggregation logic
async function buildReport(where) {
  const [orders, newClients] = await Promise.all([
    prisma.order.findMany({
      where: { ...where, orderStatus: { not: 'CANCELADA' } },
      include: {
        client: { select: { id: true, firstName: true, lastNameP: true, orderCount: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.client.findMany({
      where: { createdAt: where.createdAt || where.deliveryDate },
      select: { id: true, source: true },
    }),
  ]);

  const total = orders.reduce((s, o) => s + Number(o.total), 0);

  // Breakdown by payment method
  const byMethod = {};
  for (const o of orders) {
    const m = o.paymentMethod || 'SIN_MÉTODO';
    byMethod[m] = (byMethod[m] || 0) + Number(o.total);
  }

  // Top products
  const productCounts = {};
  for (const o of orders) {
    for (const item of o.items) {
      const name = item.product.name;
      productCounts[name] = (productCounts[name] || 0) + item.quantity;
    }
  }
  const topProducts = Object.entries(productCounts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Client sources
  const bySources = {};
  for (const c of newClients) {
    bySources[c.source] = (bySources[c.source] || 0) + 1;
  }

  // Pending payments
  const pending = orders.filter(o => o.paymentStatus === 'PENDIENTE');
  const pendingTotal = pending.reduce((s,o) => s + Number(o.total), 0);

  // Frequent clients (10+ orders in range)
  const frequentClients = orders
    .reduce((acc, o) => {
      const key = o.client.id;
      acc[key] = acc[key] || { ...o.client, orderCount: 0 };
      acc[key].orderCount++;
      return acc;
    }, {});
  const frequent = Object.values(frequentClients).filter(c => c.orderCount >= 10);

  return {
    orders,
    total,
    byMethod,
    topProducts,
    newClients: {
      count: newClients.length,
      bySources,
    },
    pending: {
      count: pending.length,
      total: pendingTotal,
      orders: pending,
    },
    frequentClients: frequent,
  };
}

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
  const from  = new Date(year, month - 1, 1);
  const to    = new Date(year, month, 0); // last day of month
  try {
    const where = { createdAt: dateRange(from, to) };
    const report = await buildReport(where);
    // Monthly: top 5 products only
    report.topProducts = report.topProducts.slice(0, 5);
    res.json({ year, month, from, to, ...report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate monthly report' });
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
