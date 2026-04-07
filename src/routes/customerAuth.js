// src/routes/customerAuth.js
const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const { prisma } = require('../db/prisma');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET  = process.env.JWT_SECRET || 'karel-secret';
const FROM_EMAIL  = process.env.FROM_EMAIL  || 'Florería Karel <pedidos@floreriakarel.com>';

// ── helpers ──
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function customerToken(customerId) {
  return jwt.sign({ customerId, role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
}

// Middleware: verify customer JWT
function requireCustomer(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded.role !== 'customer') return res.status(401).json({ error: 'No autorizado' });
    req.customerId = decoded.customerId;
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── POST /api/auth/customer/request-otp ──
// Body: { email } or { phone }
router.post('/request-otp', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Se requiere correo o teléfono' });
    }

    // Find or create customer
    let customer;
    if (email) {
      customer = await prisma.customer.upsert({
        where: { email: email.toLowerCase().trim() },
        create: { email: email.toLowerCase().trim() },
        update: {},
      });
    } else {
      const cleanPhone = phone.trim();
      customer = await prisma.customer.upsert({
        where: { phone: cleanPhone },
        create: { phone: cleanPhone },
        update: {},
      });
    }

    // Invalidate old OTPs
    await prisma.customerOTP.updateMany({
      where: { customerId: customer.id, used: false },
      data: { used: true },
    });

    // Create new OTP (expires in 10 minutes)
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.customerOTP.create({
      data: { customerId: customer.id, code, expiresAt },
    });

    // Send OTP
    if (email) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `${code} — Tu código de acceso · Florería Karel`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
            <img src="https://res.cloudinary.com/dkz7mbacc/image/upload/v1773958184/000LOGO_mrylkc.png" alt="Florería Karel" style="height:48px;margin-bottom:24px;"/>
            <h2 style="font-size:24px;color:#1a1a1a;margin-bottom:8px;">Tu código de acceso</h2>
            <p style="color:#888;margin-bottom:24px;">Ingresa este código en la página para iniciar sesión:</p>
            <div style="background:#f5d0ea;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
              <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#8100b9;">${code}</span>
            </div>
            <p style="color:#888;font-size:13px;">Este código expira en 10 minutos. Si no solicitaste este código, puedes ignorar este correo.</p>
            <hr style="border:none;border-top:1px solid #f5d0ea;margin:24px 0;"/>
            <p style="color:#ccc;font-size:12px;">Florería y Regalos Karel · Av. de la Raza 5262, Ciudad Juárez</p>
          </div>
        `,
      });
    } else {
      // SMS via Resend is not supported — log and return success
      // In production you'd use Twilio or similar for SMS
      console.log(`[OTP] Phone ${phone}: ${code}`);
      // For now we just return success — customer would need to check server logs
      // You can integrate Twilio here later
    }

    res.json({ ok: true, method: email ? 'email' : 'phone' });

  } catch(err) {
    console.error('[customerAuth] request-otp error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/customer/verify-otp ──
// Body: { email or phone, code }
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, phone, code } = req.body;

    if (!code) return res.status(400).json({ error: 'Código requerido' });
    if (!email && !phone) return res.status(400).json({ error: 'Se requiere correo o teléfono' });

    // Find customer
    let customer;
    if (email) {
      customer = await prisma.customer.findUnique({ where: { email: email.toLowerCase().trim() } });
    } else {
      customer = await prisma.customer.findUnique({ where: { phone: phone.trim() } });
    }

    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Find valid OTP
    const otp = await prisma.customerOTP.findFirst({
      where: {
        customerId: customer.id,
        code: code.trim(),
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Código incorrecto o expirado' });
    }

    // Mark OTP as used
    await prisma.customerOTP.update({
      where: { id: otp.id },
      data: { used: true },
    });

    const isNew = !customer.firstName;
    const token = customerToken(customer.id);

    res.json({
      token,
      isNew,
      customer: {
        id: customer.id,
        email: customer.email,
        phone: customer.phone,
        firstName: customer.firstName,
        lastName: customer.lastName,
      },
    });

  } catch(err) {
    console.error('[customerAuth] verify-otp error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/customers/me/profile ──
router.post('/me/profile', requireCustomer, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName) return res.status(400).json({ error: 'Nombre requerido' });

    const customer = await prisma.customer.update({
      where: { id: req.customerId },
      data: { firstName: firstName.trim(), lastName: lastName?.trim() || null },
    });

    res.json({
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      firstName: customer.firstName,
      lastName: customer.lastName,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/customers/me ──
router.get('/me', requireCustomer, async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customerId },
    });
    if (!customer) return res.status(404).json({ error: 'No encontrado' });
    res.json({
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      firstName: customer.firstName,
      lastName: customer.lastName,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/customers/me/orders ──
router.get('/me/orders', requireCustomer, async (req, res) => {
  try {
    // Find client by email or phone matching the customer
    const customer = await prisma.customer.findUnique({
      where: { id: req.customerId },
    });
    if (!customer) return res.json([]);

    // Match to Client record by email or phone
    const whereClause = [];
    if (customer.email) whereClause.push({ email: customer.email });
    if (customer.phone) whereClause.push({ phone: customer.phone.replace(/^\+52/, '') });

    if (!whereClause.length) return res.json([]);

    const client = await prisma.client.findFirst({
      where: { OR: whereClause },
    });

    if (!client) return res.json([]);

    const orders = await prisma.order.findMany({
      where: { clientId: client.id },
      include: {
        items: {
          include: { product: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json(orders);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, requireCustomer };
