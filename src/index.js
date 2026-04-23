// src/index.js
require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { prisma } = require('./db/prisma');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const orderRoutes = require('./routes/orders');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const taskRoutes = require('./routes/tasks');
const deliveryRoutes = require('./routes/deliveries');
const staffRoutes = require('./routes/staff');
const reportRoutes = require('./routes/reports');
const chatRoutes = require('./routes/chat');
const webhookRoutes = require('./routes/webhooks');
const inventoryRoutes = require('./routes/inventory');
const expenditureRoutes = require('./routes/expenditures');
const reminderRoutes = require('./routes/reminders');
const contactRoutes    = require('./routes/contact');
const closedDatesRoutes = require('./routes/closedDates');
const stripeRoutes      = require('./routes/stripe');
const { router: customerAuthRoutes } = require('./routes/customerAuth');
const mpRoutes = require('./routes/mercadopago');
const waRoutes = require('./routes/whatsapp');
const { setupChat } = require('./utils/socket');

const app = express();
const httpServer = createServer(app);

// Ensure upload directories exist
const fs = require('fs');
['uploads/products', 'uploads/deliveries'].forEach(dir => {
  const full = path.join(__dirname, '..', dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});
// ── CORS — supports multiple origins via comma-separated CORS_ORIGIN env var ──
// e.g. CORS_ORIGIN=https://karel-pos.pages.dev,https://karel-site.pages.dev
const rawOrigin = process.env.CORS_ORIGIN || '*';
const allowedOrigins = rawOrigin === '*' ? '*' : rawOrigin.split(',').map(o => o.trim());

function corsOriginFn(origin, callback) {
  // Allow requests with no origin (mobile apps, curl, Postman)
  if (!origin) return callback(null, true);
  if (allowedOrigins === '*') return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  callback(new Error(`CORS blocked: ${origin}`));
}

const corsOptions = {
  origin: corsOriginFn,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }
});

// Must be before all routes — handles preflight
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Stripe webhooks need raw body — mount BEFORE json parser
app.use('/api/webhooks', webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Attach io to requests so routes can emit events
app.use((req, _res, next) => { req.io = io; next(); });

// ── Routes ──
app.use('/api/auth',       authRoutes);
app.use('/api/clients',    clientRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tasks',      taskRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/staff',      staffRoutes);
app.use('/api/reports',    reportRoutes);
app.use('/api/chat',         chatRoutes);
app.use('/api/inventory',    inventoryRoutes);
app.use('/api/expenditures', expenditureRoutes);
app.use('/api/reminders',    reminderRoutes);
app.use('/api/contact',       contactRoutes);
app.use('/api/closed-dates',  closedDatesRoutes);
app.use('/api/stripe',        stripeRoutes);
app.use('/api/auth/customer', customerAuthRoutes);
app.use('/api/customers/me',  customerAuthRoutes);
app.use('/api/mp',            mpRoutes);
app.use('/api/whatsapp',      waRoutes);

// ── Health check ──
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Debug: check Cloudinary config (remove after confirming it works) ──
app.get('/debug/cloudinary', (_req, res) => res.json({
  configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET',
  api_key_set: !!process.env.CLOUDINARY_API_KEY,
  api_secret_set: !!process.env.CLOUDINARY_API_SECRET,
}));

// ── 404 handler ──
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Socket.io chat ──
setupChat(io);

// ── Start ──
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`\n🌹 Karel backend running on port ${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
