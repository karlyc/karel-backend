// src/routes/expenditures.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const STAFF_CATEGORIES = ['Flores', 'Bases', 'Material', 'Gasolina', 'Otro'];
const ADMIN_ONLY_CATEGORIES = ['Salarios', 'Marketing', 'Taxes'];
const ADMIN_CATEGORIES = [...STAFF_CATEGORIES, ...ADMIN_ONLY_CATEGORIES];

// GET /api/expenditures?month=1&year=2025&scope=staff
// Staff see only shared (non-private) entries and never get a total.
// Admins see everything (shared + private) and get the total — UNLESS scope=staff,
// sent by the staff-facing Operaciones > Gastos page, which an admin account can also
// visit: that page must show exactly what a non-admin would see there, even for an
// admin caller, or private financial data (salaries, rent, ...) would leak onto it.
router.get('/', requireAuth, async (req, res) => {
  const { month, year, scope } = req.query;
  const monthNum = Number(month) || new Date().getMonth() + 1;
  const yearNum = Number(year) || new Date().getFullYear();
  const isAdminView = req.staff.role === 'ADMIN' && scope !== 'staff';

  const where = {
    OR: [
      { month: monthNum, year: yearNum },
      // MENSUAL (recurring) entries count forward from their own month/year, never retroactively
      { type: 'MENSUAL', OR: [{ year: { lt: yearNum } }, { year: yearNum, month: { lte: monthNum } }] },
    ],
  };
  if (!isAdminView) where.isPrivate = false;

  try {
    const items = await prisma.expenditure.findMany({
      where,
      include: { submittedBy: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
    const response = { items };
    if (isAdminView) response.total = items.reduce((s, e) => s + Number(e.amount), 0);
    res.json(response);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  const isAdmin = req.staff.role === 'ADMIN';
  const d = new Date(req.body.date || new Date());

  const category = req.body.category;
  const allowed = isAdmin ? ADMIN_CATEGORIES : STAFF_CATEGORIES;
  if (!allowed.includes(category)) return res.status(400).json({ error: 'Categoría inválida' });

  const data = {
    category,
    description: req.body.description,
    amount: parseFloat(req.body.amount),
    date: d,
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    submittedById: req.staff.id,
    type: isAdmin && req.body.type === 'MENSUAL' ? 'MENSUAL' : 'MISCELANEA',
    isPrivate: isAdmin ? (req.body.isPrivate === undefined ? true : !!req.body.isPrivate) : false,
  };
  try {
    const item = await prisma.expenditure.create({ data });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  const isAdmin = req.staff.role === 'ADMIN';
  try {
    const existing = await prisma.expenditure.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Gasto no encontrado' });
    if (!isAdmin && (existing.submittedById !== req.staff.id || existing.isPrivate)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este gasto' });
    }

    const category = req.body.category;
    const allowed = isAdmin ? ADMIN_CATEGORIES : STAFF_CATEGORIES;
    if (!allowed.includes(category)) return res.status(400).json({ error: 'Categoría inválida' });

    const d = new Date(req.body.date || existing.date);
    const data = {
      category,
      description: req.body.description,
      amount: parseFloat(req.body.amount),
      date: d,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      type: isAdmin && req.body.type === 'MENSUAL' ? 'MENSUAL' : 'MISCELANEA',
      isPrivate: isAdmin ? (req.body.isPrivate === undefined ? existing.isPrivate : !!req.body.isPrivate) : false,
    };
    const item = await prisma.expenditure.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (req.staff.role !== 'ADMIN') return res.status(403).json({ error: 'Solo un administrador puede eliminar gastos' });
  try {
    await prisma.expenditure.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
