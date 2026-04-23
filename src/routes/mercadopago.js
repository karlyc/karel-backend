// src/routes/mercadopago.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');

function getMP() {
  const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  return { Preference, Payment, client };
}

// ── POST /api/mp/process-order ──
// Calls MP Orders API with submitData from cardPayment Brick
router.post('/process-order', async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured' });
    }

    const crypto = require('crypto');
    const idempotencyKey = crypto.randomUUID();

    const response = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(req.body),
    });

    const result = await response.json();
    console.log(`[MP] Order ${result.id} status: ${result.status} | detail: ${result.status_detail}`);

    if (!response.ok) {
      console.error('[MP] Orders API error:', JSON.stringify(result));
      return res.status(response.status).json({ error: result.message || 'MP Orders API error' });
    }

    res.json({
      id:           result.id,
      status:       result.status,
      status_detail: result.status_detail,
      transactions: result.transactions,
    });
  } catch(err) {
    console.error('[MP] process-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mp/create-preference ──
router.post('/create-preference', async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured' });
    }
    const { items, payer, total } = req.body;
    const { Preference, client } = getMP();
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: items.map(i => ({
          id: i.productId || 'product',
          title: i.name || 'Producto',
          quantity: Number(i.quantity) || 1,
          unit_price: Number(i.unitPrice),
          currency_id: 'MXN',
        })),
        payer: {
          name:    payer?.firstName || '',
          surname: payer?.lastName  || '',
          email:   payer?.email     || '',
        },
        statement_descriptor: 'Floreria Karel',
        auto_return: 'approved',
        back_urls: {
          success: `${process.env.SITE_URL || 'https://floreriakarel.com'}`,
          failure: `${process.env.SITE_URL || 'https://floreriakarel.com'}`,
          pending: `${process.env.SITE_URL || 'https://floreriakarel.com'}`,
        },
      },
    });
    console.log(`[MP] Preference created: ${result.id}`);
    res.json({ id: result.id, init_point: result.init_point, sandbox_init_point: result.sandbox_init_point });
  } catch(err) {
    console.error('[MP] create-preference error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/mp/webhook — IPN ──
router.get('/webhook', async (req, res) => {
  res.status(200).json({ received: true, topic: req.query.topic, id: req.query.id });
  try {
    const topic  = req.query.topic;
    const dataId = req.query.id;
    console.log(`[MP] IPN received: topic=${topic} id=${dataId}`);
    if (!dataId || topic !== 'payment') return;
    const { Payment, client } = getMP();
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: dataId });
    console.log(`[MP] IPN Payment ${dataId} status: ${paymentData.status}`);
    if (paymentData.status === 'approved') {
      const orderId = paymentData.metadata?.order_id || paymentData.metadata?.orderId || paymentData.external_reference;
      if (orderId) {
        await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAGADA' } })
          .catch(e => console.error('[MP] Order update failed:', e.message));
        console.log(`[MP] Order ${orderId} marked as PAGADA via IPN`);
      }
    }
  } catch(err) {
    console.error('[MP] IPN processing error:', err.message);
  }
});

// ── POST /api/mp/webhook ──
router.post('/webhook', async (req, res) => {
  res.json({ received: true });
  try {
    const body   = req.body || {};
    console.log('[MP] Webhook received:', JSON.stringify(body));
    const type   = body.type || body.action || '';
    const dataId = body.data?.id || req.query.id;
    if (!dataId) return;
    if (type.includes('payment') || req.query.topic === 'payment') {
      const { Payment, client } = getMP();
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: dataId });
      console.log(`[MP] Payment ${dataId} status: ${paymentData.status}`);
      if (paymentData.status === 'approved') {
        const orderId = paymentData.metadata?.order_id || paymentData.metadata?.orderId || paymentData.external_reference;
        if (orderId) {
          await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAGADA' } })
            .catch(e => console.error('[MP] Order update failed:', e.message));
          console.log(`[MP] Order ${orderId} marked as PAGADA`);
        }
      }
    }
  } catch(err) {
    console.error('[MP] webhook processing error:', err.message);
  }
});

module.exports = router;
