// src/utils/whatsapp.js
// Uses Meta WhatsApp Business API with approved templates

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

async function sendTemplate(to, templateName, parameters) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    console.log(`[WA] Meta API not configured. Skipping template ${templateName} to ${to}`);
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
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'es_MX' },
            components: [{
              type: 'body',
              parameters: parameters.map(p => ({ type: 'text', text: String(p) })),
            }],
          },
        }),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || JSON.stringify(result.error));
    console.log(`[WA] Template ${templateName} sent to ${to}: ${result.messages?.[0]?.id}`);
    return result;
  } catch(err) {
    console.error(`[WA] Failed to send template ${templateName} to ${to}:`, err.message);
  }
}

// ── 1. Order confirmation to customer ──
async function sendOrderConfirmation(order, client) {
  const phone = formatPhone(client?.phone, client?.phoneCode);
  if (!phone) return;

  // Use free-form message to customer (they may not have messaged first)
  // Once template is approved, switch to sendTemplate
  const items = (order.items || []).map(i => `  • ${i.product?.name || 'Producto'} x${i.quantity}`).join('\n');
  const delivDate = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Por confirmar';

  const message = `🌸 *Florería y Regalos Karel*\n\n¡Hola ${client?.firstName || 'cliente'}! Tu pedido ha sido confirmado ✅\n\n*Pedido:* #${order.orderNumber}\n*Entrega:* ${delivDate}\n*Horario:* ${order.deliveryWindow || ''}\n\n*Productos:*\n${items}\n\n*Total:* $${Number(order.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN\n\n¡Gracias por tu pedido! 💐\n📞 656 611-1124`;
  await sendWA(phone, message);
}

// ── 2. Delivery confirmation to customer ──
async function sendDeliveryConfirmation(order, client) {
  const phone = formatPhone(client?.phone, client?.phoneCode);
  if (!phone) return;

  // Template: confirmacion_de_entrega
  // Params: {{customer_name}}, {{order_id}}, {{received}}
  await sendTemplate(phone, 'confirmacion_de_entrega', [
    client?.firstName || 'cliente',
    order.orderNumber,
    order.delivery?.receivedBy || 'destinatario',
  ]);
}

// ── 3. New order notification to shop ──
async function sendShopNewOrder(order, client) {
  const shopPhone = process.env.SHOP_WHATSAPP;
  if (!shopPhone) { console.log('[WA] SHOP_WHATSAPP not set'); return; }

  // Template: orden_nueva
  // Params: {{order_id}}, {{client_name}}, {{delivery_date}}, {{product_name}}
  const delivDate = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Por confirmar';
  const products = (order.items || []).map(i => `${i.product?.name || 'Producto'} x${i.quantity}`).join(', ');
  const clientName = `${client?.firstName || ''} ${client?.lastNameP || ''}`.trim() || 'Cliente';

  await sendTemplate(shopPhone, 'orden_nueva', [
    order.orderNumber,
    clientName,
    delivDate,
    products,
  ]);
}

module.exports = { sendOrderConfirmation, sendDeliveryConfirmation, sendShopNewOrder };
