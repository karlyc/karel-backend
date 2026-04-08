// src/routes/orders.js
const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const { prisma } = require('../db/prisma');
const { requireAuth, requireAdmin, requireOffice } = require('../middleware/auth');
const { generateOrderNumber, computeLoyaltyTier } = require('../utils/orders');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');
const { sendOrderConfirmation } = require('../utils/email');
const { sendOrderConfirmation: sendWAConfirmation, sendShopNewOrder } = require('../utils/whatsapp');
// ── GET /api/orders ──
// List orders with filtering and search
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      search,
      orderStatus,
      paymentStatus,
      date,        // YYYY-MM-DD
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};

    if (orderStatus) where.orderStatus = orderStatus;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    if (date) {
      const d = new Date(date);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      where.deliveryDate = { gte: d, lt: next };
    } else if (dateFrom || dateTo) {
      where.deliveryDate = {};
      if (dateFrom) where.deliveryDate.gte = new Date(dateFrom);
      if (dateTo)   where.deliveryDate.lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { client: { firstName: { contains: search, mode: 'insensitive' } } },
        { client: { lastNameP: { contains: search, mode: 'insensitive' } } },
        { client: { phone: { contains: search } } },
        { recipientName: { contains: search, mode: 'insensitive' } },
        { recipientAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastNameP: true, phone: true, loyaltyTier: true } },
          items: { include: { product: { select: { name:true, photo1Url:true, photo2Url:true, description:true, notes:true, width:true, height:true, recipe:{ include:{ inventoryItem:{ select:{ name:true, unit:true } } } } } } } },
          attendedBy: { select: { name: true } },
          delivery: { select: { assignedToId: true, deliveredAt: true, photoUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── GET /api/orders/:id ──
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        items: { include: { product: true } },
        attendedBy: { select: { name: true, role: true } },
        delivery: { include: { assignedTo: { select: { name: true } } } },
        tasks: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ── POST /api/orders ──
// Create new order
router.post('/', upload.single('paymentProof'), [
  body('clientId').optional(),      // validated after JSON parse
  body('deliveryDate').optional(),
], async (req, res) => {
  // Support both JSON body and FormData (with optional photo)
  let bodyData = req.body;
  if (req.body.data && typeof req.body.data === 'string') {
    try { bodyData = JSON.parse(req.body.data); } catch(e) {}
  }

  const {
    clientId, deliveryDate, deliveryType, deliveryWindow,
    deliveryFee = 0,
    recipientName, recipientPhone, recipientAddress, recipientColonia,
    recipientZip, recipientNotes, businessName, businessDept,
    messageFrom, messageText, messageAnon,
    occasion = 'OTRA', hasBanda = false,
    items, paymentType, paymentMethod,
    creditDueDate, creditLocation, creditPayMethod,
    advance = 0,
    needsInvoice = false, invoiceRfc, invoiceName, invoiceCfdi, invoiceEmail,
    notifyVia, attendedById,
    subtotal: bodySubtotal, total: bodyTotal,
  } = bodyData;

  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  if (!deliveryDate) return res.status(400).json({ error: 'Delivery date is required' });
  if (!deliveryType) return res.status(400).json({ error: 'Delivery type is required' });
  if (!items || !items.length) return res.status(400).json({ error: 'At least one item required' });

  try {
    // Handle payment proof photo
    let paymentProofUrl = null;
    if (req.file) {
      if (isCloudinaryConfigured()) {
        paymentProofUrl = await uploadToCloudinary(req.file.buffer, 'karel/payment-proofs');
      } else {
        paymentProofUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      }
    }

    // Resolve prices from DB (single price per product)
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    let subtotal = 0;
    const itemData = items.map(item => {
      const product = productMap[item.productId];
      if (!product) throw new Error(`Product ${item.productId} not found`);
      const price = Number(product.price);
      subtotal += price * item.quantity;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: price,
        notes: item.notes || null,
      };
    });

    const total = subtotal + Number(deliveryFee) - Number(advance);

    // Payment status logic per spec:
    // PENDIENTE    = credit orders
    // PAGO_RECIBIDO = non-credit orders placed in POS
    // PAGADA       = web orders (set automatically) or admin-approved
    let paymentStatus = 'PAGO_RECIBIDO';
    if (paymentType === 'CREDITO') paymentStatus = 'PENDIENTE';

    const generateReminder = ['CUMPLEANOS','ANIVERSARIO'].includes(occasion);

    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await generateOrderNumber(tx);

      const created = await tx.order.create({
        data: {
          orderNumber,
          source: 'POS',
          clientId,
          occasion,
          hasBanda,
          generateReminder,
          deliveryType,
          deliveryDate: new Date(deliveryDate),
          deliveryWindow: deliveryWindow || '',
          deliveryFee,
          recipientName, recipientPhone, recipientAddress, recipientColonia,
          recipientZip: recipientZip || null,
          recipientNotes,
          businessName, businessDept,
          messageFrom, messageText, messageAnon,
          paymentStatus,
          paymentMethod: paymentType === 'CREDITO' ? null : paymentMethod,
          creditDueDate: creditDueDate ? new Date(creditDueDate) : null,
          creditLocation, creditPayMethod,
          subtotal,
          advance,
          total,
          needsInvoice,
          invoiceRfc, invoiceName, invoiceCfdi, invoiceEmail,
          notifyVia,
          attendedById: attendedById || null,
          paymentProofUrl: paymentProofUrl || null,
          items: { create: itemData },
        },
        include: { items: true },
      });

      // Auto-create delivery record for domicilio orders
      if (deliveryType !== 'RECOGER_TIENDA') {
        await tx.delivery.create({ data: { orderId: created.id } });
      }

      // Auto-create invoice task if needed
      if (needsInvoice) {
        await tx.task.create({
          data: {
            description: `Hacer factura #${orderNumber} — ${invoiceName || ''}`,
            orderId: created.id,
          },
        });
      }

      // Auto-create reminder for next year (birthday/anniversary)
      if (generateReminder) {
        const client = await tx.client.findUnique({ where: { id: clientId } });
        const deliveryDt = new Date(deliveryDate);
        const nextYear = new Date(deliveryDt);
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        nextYear.setDate(nextYear.getDate() - 2); // 2 days before
        await tx.reminder.create({
          data: {
            clientId,
            clientName: `${client.firstName} ${client.lastNameP}`,
            clientPhone: client.phone || '',
            occasion,
            eventDate: nextYear,
            orderId: created.id,
          },
        });
      }

      // Update client order count & loyalty tier
      const client = await tx.client.update({
        where: { id: clientId },
        data: { orderCount: { increment: 1 } },
      });
      const newTier = computeLoyaltyTier(client.orderCount);
      if (newTier !== client.loyaltyTier) {
        await tx.client.update({ where: { id: clientId }, data: { loyaltyTier: newTier } });
      }

      return created;
    });

    // Notify POS dashboard via socket
    req.io?.emit('order:new', { orderNumber: order.orderNumber, id: order.id });

    // Send confirmation email (fetch full order with relations first)
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        client: true,
        items: { include: { product: { select: { name: true, photo1Url: true } } } },
      },
    });
    if (fullOrder?.client?.email) {
      sendOrderConfirmation(fullOrder).catch(e => console.error('[Email] Order confirmation failed:', e.message));
    }
    // WhatsApp notifications (fire and forget)
    if (fullOrder?.client?.phone) {
      sendWAConfirmation(fullOrder, fullOrder.client).catch(e => console.error('[WA] Customer confirmation failed:', e.message));
    }
    sendShopNewOrder(fullOrder, fullOrder.client).catch(e => console.error('[WA] Shop notification failed:', e.message));

    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

// ── PATCH /api/orders/:id/status ──
// Update order status (florista moves EN_PROCESO → POR_ENTREGAR)
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { orderStatus } = req.body;
  const allowed = ['EN_PROCESO','POR_ENTREGAR','COMPLETADA'];
  if (!allowed.includes(orderStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { orderStatus },
    });
    req.io?.emit('order:statusChange', { id: order.id, orderStatus });

    // Send WhatsApp delivery confirmation when marked as COMPLETADA
    if (orderStatus === 'COMPLETADA') {
      const { sendDeliveryConfirmation } = require('../utils/whatsapp');
      const fullOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { client: true, items: { include: { product: { select: { name: true } } } } },
      });
      if (fullOrder?.client?.phone) {
        sendDeliveryConfirmation(fullOrder, fullOrder.client)
          .catch(e => console.error('[WA] Delivery confirmation failed:', e.message));
      }
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── PATCH /api/orders/:id/payment ──
// Mark as pago recibido (admin or office)
router.patch('/:id/payment', requireAuth, requireOffice, async (req, res) => {
  const { paymentStatus } = req.body;
  if (!['PAGO_RECIBIDO','PAGADA'].includes(paymentStatus)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { paymentStatus },
    });
    req.io?.emit('order:paymentChange', { id: order.id, paymentStatus });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// ── DELETE /api/orders/:id ──
// Cancel order — admin only
// ── PATCH /api/orders/:id/proof — upload payment proof photo after order creation
router.patch('/:id/proof', requireAuth, upload.single('paymentProof'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo provided' });
  try {
    let paymentProofUrl;
    if (isCloudinaryConfigured()) {
      paymentProofUrl = await uploadToCloudinary(req.file.buffer, 'karel/payment-proofs');
    } else {
      paymentProofUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { paymentProofUrl },
    });
    res.json(order);
  } catch(err) {
    console.error('Proof upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.order.update({
      where: { id: req.params.id },
      data: { orderStatus: 'CANCELADA' },
    });
    res.json({ message: 'Order cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

module.exports = router;
