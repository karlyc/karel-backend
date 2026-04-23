// src/utils/whatsapp.js
// Uses Meta WhatsApp Business API

function formatPhone(phone, phoneCode) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const code   = (phoneCode || '+52').replace('+', '');
  if (digits.length === 10) return `${code}${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return digits;
  if (digits.length > 10)   return digits;
  return `52${digits}`;
}

async function sendWA(to, message) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    console.log(`[WA] Meta API not configured. Skipping message to ${to}`);
    return;
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || JSON.stringify(result.error));
    console.log(`[WA] Sent to ${to}: ${result.messages?.[0]?.id}`);
    return result;
  } catch(err) {
    console.error(`[WA] Failed to send to ${to}:`, err.message);
  }
}

async function sendOrderConfirmation(order, client) {
  const phone = formatPhone(client?.phone, client?.phoneCode);
  if (!phone) return;
  const items = (order.items || []).map(i => `  • ${i.product?.name || 'Producto'} x${i.quantity}`).join('\n');
  const delivDate = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Por confirmar';
  const message = `🌸 *Florería y Regalos Karel*\n\n¡Hola ${client?.firstName || 'cliente'}! Tu pedido ha sido confirmado ✅\n\n*Pedido:* #${order.orderNumber}\n*Entrega:* ${delivDate}\n*Horario:* ${order.deliveryWindow || ''}\n\n*Productos:*\n${items}\n\n*Total:* $${Number(order.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN\n\n¡Gracias por tu pedido! 💐\n📞 656 611-1124`;
  await sendWA(phone, message);
}

async function sendDeliveryConfirmation(order, client) {
  const phone = formatPhone(client?.phone, client?.phoneCode);
  if (!phone) return;
  const message = `🌸 *Florería y Regalos Karel*\n\n¡Tu pedido ha sido entregado! 🎉\n\n*Pedido:* #${order.orderNumber}\n*Destinatario:* ${order.recipientName || client?.firstName || ''}\n\nEsperamos que les haya encantado 💐\n¡Gracias por elegir Florería Karel!\n\nSi tienes alguna pregunta escríbenos al 656 611-1124`;
  await sendWA(phone, message);
}

async function sendShopNewOrder(order, client) {
  const shopPhone = process.env.SHOP_WHATSAPP;
  if (!shopPhone) { console.log('[WA] SHOP_WHATSAPP not set'); return; }
  const items = (order.items || []).map(i => `  • ${i.product?.name || 'Producto'} x${i.quantity}`).join('\n');
  const delivDate = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Por confirmar';
  const message = `🛎 *Nuevo pedido recibido*\n\n*#${order.orderNumber}* — ${order.source || 'WEB'}\n\n👤 *Cliente:* ${client?.firstName || ''} ${client?.lastNameP || ''}\n📱 *Teléfono:* ${client?.phoneCode || '+52'} ${client?.phone || 'N/A'}\n📅 *Entrega:* ${delivDate} · ${order.deliveryWindow || ''}\n📍 *Dirección:* ${order.recipientAddress || 'Recoger en tienda'}\n\n*Productos:*\n${items}\n\n💰 *Total:* $${Number(order.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN\n💳 *Pago:* ${order.paymentMethod || 'N/A'}`;
  await sendWA(shopPhone, message);
}

module.exports = { sendOrderConfirmation, sendDeliveryConfirmation, sendShopNewOrder };
