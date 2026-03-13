// src/routes/staff.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const staff = await prisma.staff.findMany({
      select: { id: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(staff);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch staff' }); }
});

router.post('/', requireAuth, requireAdmin, [
  body('name').notEmpty(),
  body('pin').isLength({ min: 4, max: 8 }),
  body('role').isIn(['ADMIN','OFFICE','FLORISTA','REPARTIDOR']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const hashed = await bcrypt.hash(req.body.pin, 10);
    const staff = await prisma.staff.create({
      data: { ...req.body, pin: hashed },
      select: { id: true, name: true, role: true, active: true },
    });
    res.status(201).json(staff);
  } catch (err) { res.status(500).json({ error: 'Failed to create staff' }); }
});

router.patch('/:id/active', requireAuth, requireAdmin, async (req, res) => {
  try {
    const staff = await prisma.staff.update({
      where: { id: req.params.id },
      data: { active: req.body.active },
      select: { id: true, name: true, active: true },
    });
    res.json(staff);
  } catch (err) { res.status(500).json({ error: 'Failed to update staff' }); }
});

module.exports = router;
