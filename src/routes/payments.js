// src/routes/payments.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireAdmin, requireOffice } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');

// Recomputes an order's paid-in total from non-voided payments and, if it now
// covers the order total, auto-flips paymentStatus to PAGADA. Must run inside
// the same transaction as the payment create/void that triggered it.
async function reconcileOrderStatus(tx, orderId) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  const agg = await tx.payment.aggregate({
    where: { orderId, voided: false },
    _sum: { amount: true },
  });
  const paid = Number(agg._sum.amount || 0);
  const owed = Number(order.total) - paid;
  if (owed <= 0 && order.paymentStatus !== 'PAGADA') {
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAGADA' } });
  }
  return { paid, owed };
}

// POST /api/payments/:orderId — record a partial payment (optionally with proof, multipart)
router.post('/:orderId', requireAuth, upload.single('paymentProof'), async (req, res) => {
  const { amount, method } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Monto inválido' });
  if (!method) return res.status(400).json({ error: 'Método de pago requerido' });

  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    let proofUrl = null;
    if (req.file) {
      proofUrl = isCloudinaryConfigured()
        ? await uploadToCloudinary(req.file.buffer, 'karel/payment-proofs')
        : `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: amt,
          method,
          proofUrl,
          recordedById: req.staff?.id || null,
        },
      });
      const { paid, owed } = await reconcileOrderStatus(tx, order.id);
      return { payment, paid, owed };
    });

    req.io?.emit('order:paymentChange', { id: order.id });
    res.status(201).json(result);
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ error: err.message || 'Failed to record payment' });
  }
});

// GET /api/payments/order/:orderId — list payments for one order
router.get('/order/:orderId', requireAuth, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { orderId: req.params.orderId },
      include: { recordedBy: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

// GET /api/payments — cross-order list for Admin Pagos review
router.get('/', requireAuth, requireOffice, async (req, res) => {
  try {
    const { reviewed } = req.query;
    const where = { voided: false };
    if (reviewed !== undefined) where.reviewed = reviewed === 'true';
    const payments = await prisma.payment.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true, total: true, client: { select: { firstName: true, lastNameP: true } } } },
        recordedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

// PATCH /api/payments/:id/review — reconciliation flag, mirrors order-level payment-review
router.patch('/:id/review', requireAuth, requireOffice, async (req, res) => {
  const { reviewed } = req.body;
  try {
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: { reviewed: !!reviewed, reviewedAt: reviewed ? new Date() : null },
    });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update payment review status' });
  }
});

// DELETE /api/payments/:id — void a mistaken entry (admin only, reason required)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const reason = req.body?.reason?.trim();
  if (!reason) return res.status(400).json({ error: 'El motivo es requerido' });
  try {
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: { voided: true, voidedAt: new Date(), voidReason: reason },
    });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to void payment' });
  }
});

module.exports = router;
