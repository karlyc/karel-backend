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
// Processes payment using Bricks formData — matches official MP pattern
router.post('/process-payment', async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured' });
    }

    const { Payment, client } = getMP();
    const payment = new Payment(client);

    // Use req.body directly as MP official docs show
    const result = await payment.create({ body: req.body });

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
          success: `${process.env.SITE_URL || 'https://karel-site.pages.dev'}`,
          failure: `${process.env.SITE_URL || 'https://karel-site.pages.dev'}`,
          pending: `${process.env.SITE_URL || 'https://karel-site.pages.dev'}`,
        },
      },
    });

    console.log(`[MP] Preference created: ${result.id}`);

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch(err) {
    console.error('[MP] create-preference error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mp/webhook ──
router.post('/webhook', async (req, res) => {
  res.json({ received: true }); // Always 200 immediately

  try {
    // Verify webhook signature if secret is configured
    if (process.env.MP_WEBHOOK_SECRET) {
      const crypto = require('crypto');
      const xSignature = req.headers['x-signature'];
      const xRequestId = req.headers['x-request-id'];
      const dataId = req.query['data.id'] || req.body?.data?.id;

      if (xSignature) {
        const parts = xSignature.split(',');
        let ts, hash;
        parts.forEach(part => {
          const [key, val] = part.trim().split('=');
          if (key === 'ts') ts = val;
          if (key === 'v1') hash = val;
        });

        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        const expected = crypto
          .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
          .update(manifest)
          .digest('hex');

        if (expected !== hash) {
          console.warn('[MP] Webhook signature mismatch — ignoring');
          return;
        }
      }
    }
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
        const orderId = paymentData.metadata?.order_id ||
                        paymentData.metadata?.orderId  ||
                        paymentData.external_reference;
        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data:  { paymentStatus: 'PAGADA' },
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
router.get('/payment-status/:paymentId', async (req, res) => {
  try {
    const { Payment, client } = getMP();
    const payment = new Payment(client);
    const data = await payment.get({ id: req.params.paymentId });
    res.json({ status: data.status });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
