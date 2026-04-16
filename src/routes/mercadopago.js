// src/routes/mercadopago.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');

function getMP() {
  const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
  const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
  });
  return { Preference, Payment, client };
}

// ── POST /api/mp/process-payment ──
// Processes payment using Bricks formData
router.post('/process-payment', async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured' });
    }

    const { formData, amount, email, description } = req.body;
    const { Payment, client } = getMP();

    const payment = new Payment(client);
    const result = await payment.create({
      body: {
        ...formData,
        transaction_amount: Number(amount),
        description: description || 'Florería y Regalos Karel',
        payer: {
          email: formData.payer?.email || email,
          identification: formData.payer?.identification,
        },
      },
    });

    console.log(`[MP] Payment ${result.id} status: ${result.status} | detail: ${result.status_detail}`);

    res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
    });
  } catch(err) {
    console.error('[MP] process-payment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mp/create-preference ──
// Creates a Mercado Pago preference and returns the checkout URL
router.post('/create-preference', async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured' });
    }

    const { items, payer, orderId, total } = req.body;
    const { Preference, client } = getMP();

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: items.map(i => ({
          id: i.productId,
          title: i.name,
          quantity: i.quantity,
          unit_price: Number(i.unitPrice),
          currency_id: 'MXN',
        })),
        payer: {
          name: payer?.firstName || '',
          surname: payer?.lastName || '',
          email: payer?.email || '',
          phone: { number: payer?.phone || '' },
        },
        back_urls: {
          success: `${process.env.SITE_URL || 'https://karel-site.pages.dev'}?mp=success&orderId=${orderId}`,
          failure: `${process.env.SITE_URL || 'https://karel-site.pages.dev'}?mp=failure`,
          pending: `${process.env.SITE_URL || 'https://karel-site.pages.dev'}?mp=pending&orderId=${orderId}`,
        },
        auto_return: 'approved',
        external_reference: orderId || 'web-order',
        statement_descriptor: 'Floreria Karel',
        metadata: { orderId },
      },
    });

    res.json({
      id: result.id,
      init_point: result.init_point,       // redirect URL for production
      sandbox_init_point: result.sandbox_init_point, // redirect URL for testing
    });
  } catch(err) {
    console.error('[MP] create-preference error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mp/webhook ──
// Mercado Pago payment notification
router.post('/webhook', async (req, res) => {
  // Always return 200 immediately — MP requires fast response
  res.json({ received: true });

  try {
    const body = req.body || {};
    console.log('[MP] Webhook received:', JSON.stringify(body));

    // MP sends different formats depending on the event type
    // Format 1: { type: 'payment', data: { id: '123' } }
    // Format 2: { action: 'payment.updated', data: { id: '123' } }
    // Format 3: query params ?topic=payment&id=123
    const type   = body.type || body.action || '';
    const dataId = body.data?.id || req.query.id;

    if (!dataId) return; // empty simulation or ping — ignore

    if (type.includes('payment') || req.query.topic === 'payment') {
      const { Payment, client } = getMP();
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: dataId });

      console.log(`[MP] Payment ${dataId} status: ${paymentData.status}`);

      if (paymentData.status === 'approved') {
        const orderId = paymentData.metadata?.order_id ||
                        paymentData.metadata?.orderId ||
                        paymentData.external_reference;
        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAGADA' },
          }).catch(e => console.error('[MP] Order update failed:', e.message));
          console.log(`[MP] Order ${orderId} marked as PAGADA`);
        }
      }
    }
  } catch(err) {
    console.error('[MP] webhook processing error:', err.message);
  }
});

// ── GET /api/mp/payment-status/:paymentId ──
// Check payment status (called after redirect back from MP)
router.get('/payment-status/:paymentId', async (req, res) => {
  try {
    const { Payment, client } = getMP();
    const payment = new Payment(client);
    const data = await payment.get({ id: req.params.paymentId });
    res.json({
      status: data.status,
      orderId: data.metadata?.order_id || data.external_reference,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
