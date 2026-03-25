// src/routes/clients.js
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

// GET /api/clients?search=...
router.get('/', async (req, res) => {
  const { search } = req.query;
  const where = search ? {
    OR: [
      { phone: { contains: search } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastNameP: { contains: search, mode: 'insensitive' } },
    ]
  } : {};
  try {
    const clients = await prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, firstName: true, lastNameP: true, lastNameM: true,
        phone: true, email: true, loyaltyTier: true, orderCount: true,
      },
    });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, orderNumber: true, deliveryDate: true, total: true, orderStatus: true },
        },
      },
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// POST /api/clients
router.post('/', [
  body('phone').notEmpty().withMessage('Phone is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastNameP').notEmpty().withMessage('Last name is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const existing = await prisma.client.findUnique({ where: { phone: req.body.phone } });
    if (existing) return res.status(409).json({ error: 'Phone already registered', client: existing });

    const client = await prisma.client.create({ data: req.body });
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update client' });
  }
});

module.exports = router;
