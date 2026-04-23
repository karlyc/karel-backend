// src/routes/whatsapp.js
const router = require('express').Router();

// ── GET /api/whatsapp/webhook ──
// Meta webhook verification
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[WA] Webhook verification request:', { mode, token });

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WA] Webhook verified ✓');
    res.status(200).send(challenge);
  } else {
    console.warn('[WA] Webhook verification failed — token mismatch');
    res.status(403).json({ error: 'Verification failed' });
  }
});

// ── POST /api/whatsapp/webhook ──
// Receive incoming WhatsApp messages
router.post('/webhook', (req, res) => {
  res.status(200).json({ received: true }); // Always 200 immediately

  try {
    const body = req.body;
    console.log('[WA] Webhook received:', JSON.stringify(body).slice(0, 300));

    // Process incoming messages
    if (body.object === 'whatsapp_business_account') {
      body.entry?.forEach(entry => {
        entry.changes?.forEach(change => {
          const messages = change.value?.messages;
          if (messages) {
            messages.forEach(msg => {
              console.log(`[WA] Message from ${msg.from}: ${msg.text?.body || msg.type}`);
            });
          }
        });
      });
    }
  } catch(err) {
    console.error('[WA] Webhook processing error:', err.message);
  }
});

// ── Helper: Send WhatsApp message via Meta API ──
async function sendWhatsAppMessage(to, message) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    console.warn('[WA] Meta API not configured — skipping');
    return;
  }

  // Format phone number — must be in international format without +
  const phone = to.replace(/\D/g, '');

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || 'Meta WA API error');
  }
  return result;
}

module.exports = router;
module.exports.sendWhatsAppMessage = sendWhatsAppMessage;
