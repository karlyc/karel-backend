// src/routes/deliveries.js
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../../uploads/deliveries')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/deliveries/today — today's deliveries for dashboard
router.get('/today', requireAuth, async (req, res) => {
  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const deliveries = await prisma.order.findMany({
      where: {
        deliveryDate: { gte: today, lt: tomorrow },
        orderStatus: { in: ['EN_PROCESO','POR_ENTREGAR'] },
        deliveryType: { not: 'RECOGER_TIENDA' },
      },
      include: {
        client: { select: { firstName: true, lastNameP: true, phone: true } },
        items: { include: { product: { select: { name: true, photo1Url: true } } } },
        delivery: { include: { assignedTo: { select: { id: true, name: true } } } },
      },
      orderBy: { deliveryWindow: 'asc' },
    });
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch today deliveries' });
  }
});

// GET /api/deliveries/tomorrow
router.get('/tomorrow', requireAuth, async (req, res) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0,0,0,0);
  const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1);

  try {
    const deliveries = await prisma.order.findMany({
      where: {
        deliveryDate: { gte: tomorrow, lt: dayAfter },
        orderStatus: { in: ['EN_PROCESO','POR_ENTREGAR'] },
        deliveryType: { not: 'RECOGER_TIENDA' },
      },
      include: {
        client: { select: { firstName: true, lastNameP: true, phone: true } },
        items: { include: { product: { select: { name: true, photo1Url: true } } } },
        delivery: true,
      },
      orderBy: { deliveryWindow: 'asc' },
    });
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tomorrow deliveries' });
  }
});

// GET /api/deliveries/assigned/:staffId — repartidor's own deliveries
router.get('/assigned/:staffId', requireAuth, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: { gte: today, lt: tomorrow },
        orderStatus: 'POR_ENTREGAR',
        delivery: { assignedToId: req.params.staffId },
      },
      include: {
        client: { select: { firstName: true, lastNameP: true, phone: true } },
        items: { include: { product: { select: { name: true, description: true, photo1Url: true, photo2Url: true } } } },
        delivery: true,
      },
      orderBy: { deliveryWindow: 'asc' },
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assigned deliveries' });
  }
});

// PATCH /api/deliveries/:orderId/assign
router.patch('/:orderId/assign', requireAuth, async (req, res) => {
  const { staffId } = req.body;
  try {
    const delivery = await prisma.delivery.update({
      where: { orderId: req.params.orderId },
      data: { assignedToId: staffId },
    });
    req.io?.emit('delivery:assigned', { orderId: req.params.orderId, staffId });
    res.json(delivery);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign delivery' });
  }
});

// POST /api/deliveries/:orderId/confirm — repartidor confirms delivery
router.post('/:orderId/confirm', requireAuth, upload.single('photo'), async (req, res) => {
  const { receivedBy, notifyVia } = req.body;
  const photoUrl = req.file ? `/uploads/deliveries/${req.file.filename}` : null;

  if (!receivedBy) return res.status(400).json({ error: 'receivedBy is required' });
  if (!photoUrl)   return res.status(400).json({ error: 'Delivery photo is required' });

  try {
    const [delivery, order] = await prisma.$transaction([
      prisma.delivery.update({
        where: { orderId: req.params.orderId },
        data: { receivedBy, deliveredAt: new Date(), photoUrl, notificationSent: !!notifyVia },
      }),
      prisma.order.update({
        where: { id: req.params.orderId },
        data: { orderStatus: 'COMPLETADA' },
      }),
    ]);

    // TODO: send notification to client via notifyVia channel

    req.io?.emit('delivery:confirmed', {
      orderId: req.params.orderId,
      receivedBy,
      deliveredAt: delivery.deliveredAt,
    });

    res.json({ delivery, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm delivery' });
  }
});

module.exports = router;
