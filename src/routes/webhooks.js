// src/routes/webhooks.js
// Must be mounted BEFORE express.json() to receive raw body
const router = require('express').Router();
const { prisma } = require('../db/prisma');

router.post('/stripe', require('express').raw({ type: 'application/json' }), async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature invalid:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAGADA' },
      });
      console.log(`Order ${orderId} marked as PAGADA via Stripe`);
    }
  }

  res.json({ received: true });
});

module.exports = router;
