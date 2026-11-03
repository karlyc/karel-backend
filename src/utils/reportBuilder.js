// src/utils/reportBuilder.js — shared sales/report aggregation, used by the
// reports API routes and by the monthly email job so both stay in sync.
const { prisma } = require('../db/prisma');

// Store timezone — orders are timestamped in UTC, so weekday math must go
// through the store's local time or a late-night order can land on the wrong day.
const STORE_TZ = 'America/Ciudad_Juarez';

function isWeekday(date) {
  const dow = new Date(date).toLocaleDateString('en-US', { timeZone: STORE_TZ, weekday: 'short' });
  return dow !== 'Sat' && dow !== 'Sun';
}

function dateRange(from, to) {
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  const end   = new Date(to);   end.setHours(23, 59, 59, 999);
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

  // Top products — falls back to customName for quick/accessory items with no catalog product
  const productCounts = {};
  for (const o of orders) {
    for (const item of o.items) {
      const name = item.product?.name || item.customName || 'Producto';
      productCounts[name] = (productCounts[name] || 0) + item.quantity;
    }
  }
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Client sources
  const bySources = {};
  for (const c of newClients) {
    bySources[c.source] = (bySources[c.source] || 0) + 1;
  }

  // Pending payments
  const pending = orders.filter(o => o.paymentStatus === 'PENDIENTE');
  const pendingTotal = pending.reduce((s, o) => s + Number(o.total), 0);

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

// Average orders/day, counting only Monday–Friday — denominator stops at
// today for the current (in-progress) month so it isn't diluted by days
// that haven't happened yet.
function avgOrdersPerWeekday(orders, from, to) {
  const periodEnd = to > new Date() ? new Date() : to;
  let weekdayDays = 0;
  for (const d = new Date(from); d <= periodEnd; d.setDate(d.getDate() + 1)) {
    if (d.getDay() >= 1 && d.getDay() <= 5) weekdayDays++;
  }
  const weekdayOrders = orders.filter(o => isWeekday(o.createdAt)).length;
  return weekdayDays > 0 ? weekdayOrders / weekdayDays : 0;
}

async function getMonthlyReport(year, month) {
  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 0); // last day of month
  const where = { createdAt: dateRange(from, to) };
  const report = await buildReport(where);
  report.topProducts = report.topProducts.slice(0, 5);
  report.avgOrdersPerWeekday = avgOrdersPerWeekday(report.orders, from, to);
  return { year, month, from, to, ...report };
}

// Mirrors the admin-view query in routes/expenditures.js (shared entries +
// private + recurring MENSUAL entries counting forward from their start month).
async function getMonthlyExpenditures(year, month) {
  const where = {
    OR: [
      { month, year },
      { type: 'MENSUAL', OR: [{ year: { lt: year } }, { year, month: { lte: month } }] },
    ],
  };
  const items = await prisma.expenditure.findMany({
    where,
    include: { submittedBy: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });
  const total = items.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = items.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {});
  return { items, total, byCategory };
}

module.exports = { buildReport, dateRange, getMonthlyReport, getMonthlyExpenditures, isWeekday, STORE_TZ };
