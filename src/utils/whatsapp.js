// src/utils/whatsapp.js
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const SHOP = process.env.SHOP_WHATSAPP; // e.g. whatsapp:+526561303595

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  // Ensure it has country code
  if (digits.length === 10) return `whatsapp:+52${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return `whatsapp:+${digits}`;
  if (digits.startsWith('+')) return `whatsapp:${phone}`;
  return `whatsapp:+${digits}`;
}

async function sendWA(to, body) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`[WA] Not configured. To: ${to}\n${body}`);
    return;
  }
  try {
    const msg = await client.messages.create({ from: FROM, to, body });
    console.log(`[WA] Sent to ${to}: ${msg.sid}`);
    return msg;
  } catch(err) {
    console.error(`[WA] Failed to send to ${to}:`, err.message);
  }
}

// ── 1. Order confirmation to customer ──
async function sendOrderConfirmation(order, client) {
  const phone = formatPhone(client?.phone);
  if (!phone) return;

  const items = (order.items || [])
    .map(i => `  • ${i.product?.name || 'Producto'} ×${i.quantity}`)
    .join('\n');

  const delivDate = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })
    : 'Por confirmar';

  const body =
`🌸 *Florería y Regalos Karel*

¡Hola ${client?.firstName || 'cliente'}! Tu pedido ha sido confirmado ✅

*Pedido:* #${order.orderNumber}
*Entrega:* ${delivDate}
*Horario:* ${order.deliveryWindow || ''}

*Productos:*
${items}

*Total:* $${Number(order.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN

Nos pondremos en contacto contigo para coordinar los detalles. ¡Gracias por tu pedido! 💐

📞 656 611-1124`;

  await sendWA(phone, body);
}

// ── 2. Delivery confirmation to customer ──
async function sendDeliveryConfirmation(order, client) {
  const phone = formatPhone(client?.phone);
  if (!phone) return;

  const body =
`🌸 *Florería y Regalos Karel*

¡Tu pedido ha sido entregado! 🎉

*Pedido:* #${order.orderNumber}
*Destinatario:* ${order.recipientName || client?.firstName || ''}

Esperamos que les haya encantado 💐 ¡Gracias por elegir Florería Karel!

Si tienes alguna pregunta, escríbenos al 656 611-1124`;

  await sendWA(phone, body);
}

// ── 3. New order notification to shop ──
async function sendShopNewOrder(order, client) {
  if (!SHOP) {
    console.log('[WA] SHOP_WHATSAPP not set, skipping shop notification');
    return;
  }

  const items = (order.items || [])
    .map(i => `  • ${i.product?.name || 'Producto'} ×${i.quantity}`)
    .join('\n');

  const delivDate = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })
    : 'Por confirmar';

  const body =
`🛎 *Nuevo pedido recibido*

*#${order.orderNumber}* — ${order.source || 'WEB'}

👤 *Cliente:* ${client?.firstName || ''} ${client?.lastNameP || ''}
📱 *Teléfono:* ${client?.phone || 'N/A'}
📅 *Entrega:* ${delivDate} · ${order.deliveryWindow || ''}
📍 *Dirección:* ${order.recipientAddress || 'Recoger en tienda'}

*Productos:*
${items}

💰 *Total:* $${Number(order.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
💳 *Pago:* ${order.paymentMethod || 'N/A'}`;

  await sendWA(SHOP, body);
}

module.exports = { sendOrderConfirmation, sendDeliveryConfirmation, sendShopNewOrder };
