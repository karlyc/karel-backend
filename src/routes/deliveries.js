// src/routes/deliveries.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');
const { sendDeliveryNotification } = require('../utils/email');

// GET /api/deliveries/today
router.get('/today', requireAuth, async (req, res) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  try {
    const deliveries = await prisma.order.findMany({
      where: {
        deliveryDate: { gte: today, lt: tomorrow },
        orderStatus: { in: ['EN_PROCESO','POR_ENTREGAR'] },
        deliveryType: { not: 'RECOGER_TIENDA' },
      },
      include: {
        client: { select: { firstName:true, lastNameP:true, phone:true } },
        items: { include: { product: { select: { name:true, photo1Url:true } } } },
        delivery: { include: { assignedTo: { select: { id:true, name:true } } } },
      },
      orderBy: { deliveryWindow: 'asc' },
    });
    res.json(deliveries);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/deliveries/tomorrow
router.get('/tomorrow', requireAuth, async (req, res) => {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0);
  const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate()+1);
  try {
    const deliveries = await prisma.order.findMany({
      where: { deliveryDate: { gte: tomorrow, lt: dayAfter }, orderStatus: { in: ['EN_PROCESO','POR_ENTREGAR'] }, deliveryType: { not: 'RECOGER_TIENDA' } },
      include: { client: { select: { firstName:true, lastNameP:true, phone:true } }, items: { include: { product: { select: { name:true, photo1Url:true } } } }, delivery: true },
      orderBy: { deliveryWindow: 'asc' },
    });
    res.json(deliveries);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/deliveries/assigned/:staffId
router.get('/assigned/:staffId', requireAuth, async (req, res) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  try {
    const orders = await prisma.order.findMany({
      where: { deliveryDate: { gte: today, lt: tomorrow }, orderStatus: 'POR_ENTREGAR', delivery: { assignedToId: req.params.staffId } },
      include: {
        client: { select: { firstName:true, lastNameP:true, phone:true, phoneCode:true } },
        items: { include: { product: { select: { name:true, description:true, photo1Url:true, photo2Url:true } } } },
        delivery: true,
      },
      orderBy: { deliveryWindow: 'asc' },
    });
    res.json(orders);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/deliveries/:orderId/assign
router.patch('/:orderId/assign', requireAuth, async (req, res) => {
  const { staffId } = req.body;
  try {
    const delivery = await prisma.delivery.update({
      where: { orderId: req.params.orderId },
      data: { assignedToId: staffId || null },
    });
    req.io?.emit('delivery:assigned', { orderId: req.params.orderId, staffId });
    res.json(delivery);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /api/deliveries/:orderId/confirm
router.post('/:orderId/confirm', requireAuth, upload.single('photo'), async (req, res) => {
  const { receivedBy } = req.body;
  if (!receivedBy?.trim()) {
    return res.status(400).json({ error: '¿Quién recibió la entrega?' });
  }

  try {
    let photoUrl = null;

    if (req.file) {
      if (isCloudinaryConfigured()) {
        // Upload to Cloudinary
        photoUrl = await uploadToCloudinary(req.file.buffer, 'karel/deliveries');
      } else {
        // Fallback: store as base64 data URL (works without Cloudinary, larger DB but functional)
        const b64 = req.file.buffer.toString('base64');
        photoUrl = `data:${req.file.mimetype};base64,${b64}`;
      }
    }

    // Verify order exists first
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) {
      return res.status(404).json({ error: `Pedido no encontrado: ${req.params.orderId}` });
    }

    const delivery = await prisma.delivery.upsert({
      where: { orderId: req.params.orderId },
      create: { orderId: req.params.orderId, receivedBy: receivedBy.trim(), deliveredAt: new Date(), photoUrl, notificationSent: false },
      update: { receivedBy: receivedBy.trim(), deliveredAt: new Date(), photoUrl, notificationSent: false },
    });

    await prisma.order.update({
      where: { id: req.params.orderId },
      data: { orderStatus: 'COMPLETADA' },
    });

    req.io?.emit('delivery:confirmed', { orderId: req.params.orderId, receivedBy, deliveredAt: delivery.deliveredAt });

    // Send notifications — wrapped so they never crash the response
    try {
      const fullOrder = await prisma.order.findUnique({
        where: { id: req.params.orderId },
        include: { client: true, items: { include: { product: { select: { name: true } } } } },
      });

      if (fullOrder?.client?.email && fullOrder?.notifyVia === 'email') {
        sendDeliveryNotification(fullOrder, delivery)
          .catch(e => console.error('[Email] Delivery notification failed:', e.message));
      }

      if (fullOrder?.client?.phone) {
        const notifyVia = fullOrder?.notifyVia || '';
        if (notifyVia === 'whatsapp' || notifyVia === 'none' || !notifyVia) {
          const { sendDeliveryConfirmation } = require('../utils/whatsapp');
          sendDeliveryConfirmation(fullOrder, fullOrder.client)
            .catch(e => console.error('[WA] Delivery notification failed:', e.message));
        }
      }
    } catch(notifErr) {
      console.error('[Delivery] Notification error (non-fatal):', notifErr.message);
    }

    res.json({ delivery });
  } catch(err) {
    console.error('[Delivery confirm] Error:', err.message, '| orderId:', req.params.orderId);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
