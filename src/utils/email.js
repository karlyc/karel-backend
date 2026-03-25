// src/utils/email.js — Send transactional emails via Resend
const { Resend } = require('resend');

// Lazy initialization — only create client when actually sending
// This prevents crash on startup if RESEND_API_KEY is not set locally
let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.FROM_EMAIL || 'Florería Karel <pedidos@floreriakarel.com>';

// ─── Helpers ────────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtWindow(w) {
  if (!w) return '—';
  const [type, time] = w.split('_');
  const labels = { antes: 'Antes de', despues: 'Después de', exactamente: 'Exactamente' };
  return `${labels[type] || type} ${time || ''}`;
}

// ─── Build HTML receipt ──────────────────────────────────────
function buildReceiptHTML(order) {
  const isPickup   = order.deliveryType === 'RECOGER_TIENDA';
  const clientName = [order.client?.firstName, order.client?.middleName, order.client?.lastNameP, order.client?.lastNameM].filter(Boolean).join(' ') || '—';
  const clientPhone = order.client?.phone ? `${order.client.phoneCode || '+52'} ${order.client.phone}` : '';
  const deliveryAddr = isPickup
    ? 'Recoger en tienda — Av. de la Raza 5262, Villa del Norte, C.P. 32369'
    : [order.recipientAddress, order.recipientColonia, order.recipientZip].filter(Boolean).join(', ');
  const payMap = {
    EFECTIVO:'Efectivo', TRANSFERENCIA:'Transferencia', TERMINAL:'Terminal',
    CASHAPP:'CashApp', APPLE_PAY:'Apple Pay', LINK_PAGO:'Link de pago',
    CHEQUE:'Cheque', ZELLE:'Zelle', STRIPE:'Tarjeta (en línea)',
  };
  const payLabel = order.paymentStatus === 'PENDIENTE'
    ? 'Crédito (pendiente de pago)'
    : (payMap[order.paymentMethod] || order.paymentMethod || '—');

  const productRows = (order.items || []).map(i => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f5f5f5;font-size:13px;">${i.product?.name || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f5f5f5;font-size:13px;text-align:center;">${i.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f5f5f5;font-size:13px;text-align:right;font-weight:700;">$${fmt(i.unitPrice)}</td>
    </tr>`).join('');

  const orderDate = new Date(order.createdAt).toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Pedido ${order.orderNumber} — Florería y Regalos Karel</title>
</head>
<body style="margin:0;padding:0;background:#f5f0ee;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ee;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#C96E60,#e08070);padding:32px 36px;text-align:center;">
      <div style="font-size:2.5rem;margin-bottom:8px;">🌹</div>
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:white;letter-spacing:.02em;text-transform:uppercase;">
        FLORERÍA Y REGALOS KAREL
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:4px;letter-spacing:.1em;">
        AV. DE LA RAZA 5262 · C.P. 32369 · CIUDAD JUÁREZ
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:2px;">
        RFC: GMB081001TH8 &nbsp;|&nbsp; WhatsApp: (656) 130-3595
      </div>
    </td>
  </tr>

  <!-- ORDER NUMBER BADGE -->
  <tr>
    <td style="padding:28px 36px 0;text-align:center;">
      <div style="display:inline-block;background:#fff5f3;border:2px solid #C96E60;border-radius:100px;padding:10px 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#C96E60;margin-bottom:4px;">Número de Pedido</div>
        <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1a1a;">${order.orderNumber}</div>
      </div>
      <div style="font-size:12px;color:#888;margin-top:10px;">${orderDate}</div>
    </td>
  </tr>

  <!-- BODY -->
  <tr><td style="padding:28px 36px;">

    <!-- CLIENT -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr><td colspan="2" style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#C96E60;border-bottom:1.5px solid #f0e8e6;padding-bottom:6px;margin-bottom:10px;">👤 Cliente</td></tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;width:110px;">Nombre</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${clientName}</td>
      </tr>
      ${clientPhone ? `<tr><td style="padding:6px 0;font-size:13px;color:#888;">Teléfono</td><td style="padding:6px 0;font-size:13px;font-weight:600;">${clientPhone}</td></tr>` : ''}
      ${order.client?.email ? `<tr><td style="padding:6px 0;font-size:13px;color:#888;">Correo</td><td style="padding:6px 0;font-size:13px;font-weight:600;">${order.client.email}</td></tr>` : ''}
    </table>

    <!-- DELIVERY -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr><td colspan="2" style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#C96E60;border-bottom:1.5px solid #f0e8e6;padding-bottom:6px;">🚐 Entrega</td></tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;width:110px;">Fecha</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('es-MX', {weekday:'long', year:'numeric', month:'long', day:'numeric'}) : '—'}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;">Horario</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${fmtWindow(order.deliveryWindow)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;">Tipo</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${isPickup ? 'Recoger en tienda' : order.deliveryType === 'DOMICILIO_NEGOCIO' ? 'Negocio / Trabajo' : 'A domicilio'}</td>
      </tr>
      ${!isPickup && order.recipientName ? `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;">Destinatario</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${order.recipientName}${order.recipientPhone ? ' · ' + order.recipientPhone : ''}</td>
      </tr>` : ''}
      ${order.businessName ? `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;">Negocio</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${order.businessName}${order.businessDept ? ' — ' + order.businessDept : ''}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;">Dirección</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${deliveryAddr || '—'}</td>
      </tr>
      ${order.recipientNotes ? `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;">Notas</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${order.recipientNotes}</td>
      </tr>` : ''}
      ${order.messageText ? `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#888;">Mensaje</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;font-style:italic;">"${order.messageText}"<br/><span style="font-style:normal;color:#888;font-size:12px;">— ${order.messageAnon ? 'Anónimo' : order.messageFrom || ''}</span></td>
      </tr>` : ''}
    </table>

    <!-- PRODUCTS -->
    <div style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#C96E60;border-bottom:1.5px solid #f0e8e6;padding-bottom:6px;margin-bottom:12px;">🌺 Productos</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:10px;overflow:hidden;margin-bottom:16px;">
      <thead>
        <tr style="background:#faf5f3;">
          <th style="padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;text-align:left;">Producto</th>
          <th style="padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;text-align:center;">Cant.</th>
          <th style="padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;text-align:right;">Precio</th>
        </tr>
      </thead>
      <tbody>${productRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#aaa;">Sin productos</td></tr>'}</tbody>
    </table>

    <!-- TOTALS -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#888;">Subtotal</td>
        <td style="padding:4px 0;font-size:13px;text-align:right;">$${fmt(order.subtotal)}</td>
      </tr>
      ${Number(order.deliveryFee) > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#888;">Envío</td><td style="padding:4px 0;font-size:13px;text-align:right;">$${fmt(order.deliveryFee)}</td></tr>` : ''}
      ${Number(order.advance) > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#888;">Anticipo</td><td style="padding:4px 0;font-size:13px;text-align:right;color:#C96E60;">− $${fmt(order.advance)}</td></tr>` : ''}
      <tr>
        <td colspan="2" style="border-top:2px solid #1a1a1a;padding-top:10px;"></td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:16px;font-weight:800;">TOTAL</td>
        <td style="padding:4px 0;font-size:20px;font-weight:800;text-align:right;color:#C96E60;">$${fmt(order.total)} MXN</td>
      </tr>
    </table>

    <!-- PAYMENT -->
    <div style="background:#f0faf0;border:1.5px solid #a5d6a7;border-radius:10px;padding:12px 16px;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#2e7d32;margin-bottom:4px;">💳 Forma de Pago</div>
      <div style="font-size:13px;font-weight:600;color:#1a1a1a;">${payLabel}</div>
    </div>

  </td></tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#2e2320;padding:24px 36px;text-align:center;">
      <div style="font-family:Georgia,serif;font-size:14px;color:white;margin-bottom:6px;">Florería y Regalos Karel</div>
      <div style="font-size:11px;color:rgba(255,255,255,.6);line-height:1.8;">
        Av. de la Raza 5262 · Ciudad Juárez, Chih.<br/>
        Tel: 656 611 1124 &nbsp;·&nbsp; WhatsApp: (656) 130-3595<br/>
        RFC: GMB081001TH8
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:12px;">
        Gracias por su preferencia 🌹
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

// ─── Send order confirmation ─────────────────────────────────
async function sendOrderConfirmation(order) {
  const email = order.client?.email;
  if (!email) return { skipped: true, reason: 'No email on file' };
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: 'RESEND_API_KEY not set' };

  try {
    const result = await getResend().emails.send({
      from: FROM,
      to: email,
      subject: `Pedido ${order.orderNumber} confirmado — Florería y Regalos Karel 🌹`,
      html: buildReceiptHTML(order),
    });
    console.log(`[Email] Sent confirmation to ${email} — ID: ${result.data?.id}`);
    return { sent: true, id: result.data?.id };
  } catch (err) {
    console.error('[Email] Failed to send:', err.message);
    return { sent: false, error: err.message };
  }
}

// ─── Send delivery notification ──────────────────────────────
async function sendDeliveryNotification(order, delivery) {
  const email = order.client?.email;
  if (!email) return { skipped: true, reason: 'No email on file' };
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: 'RESEND_API_KEY not set' };

  const clientName = order.client?.firstName || 'Cliente';
  const time = new Date(delivery.deliveredAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f0ee;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ee;padding:32px 16px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#6B9469,#80AE7E);padding:28px 32px;text-align:center;">
    <div style="font-size:2.5rem;margin-bottom:6px;">✅</div>
    <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:white;">¡Entrega Confirmada!</div>
    <div style="font-size:12px;color:rgba(255,255,255,.85);margin-top:4px;">Florería y Regalos Karel</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 20px;">
      Hola <strong>${clientName}</strong>, tu pedido <strong>${order.orderNumber}</strong> fue entregado exitosamente. 🌹
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf0;border-radius:10px;padding:16px;margin-bottom:20px;">
      <tr>
        <td style="padding:5px 0;font-size:13px;color:#888;width:120px;">Recibió</td>
        <td style="padding:5px 0;font-size:13px;font-weight:600;">${delivery.receivedBy || '—'}</td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:13px;color:#888;">Hora</td>
        <td style="padding:5px 0;font-size:13px;font-weight:600;">${time}</td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:13px;color:#888;">Pedido</td>
        <td style="padding:5px 0;font-size:13px;font-weight:600;">${order.orderNumber}</td>
      </tr>
    </table>
    <p style="font-size:13px;color:#888;line-height:1.7;margin:0;">
      Gracias por preferir Florería y Regalos Karel. ¡Esperamos que disfruten el arreglo!
    </p>
  </td></tr>
  <tr><td style="background:#2e2320;padding:18px 32px;text-align:center;">
    <div style="font-size:11px;color:rgba(255,255,255,.6);">
      Florería y Regalos Karel · WhatsApp: (656) 130-3595
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  try {
    const result = await getResend().emails.send({
      from: FROM,
      to: email,
      subject: `Tu pedido ${order.orderNumber} fue entregado ✅`,
      html,
    });
    console.log(`[Email] Delivery notification sent to ${email}`);
    return { sent: true, id: result.data?.id };
  } catch (err) {
    console.error('[Email] Delivery notification failed:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendOrderConfirmation, sendDeliveryNotification };
