// src/index.js
require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { prisma } = require('./db/prisma');
const authRoutes        = require('./routes/auth');
const clientRoutes      = require('./routes/clients');
const orderRoutes       = require('./routes/orders');
const productRoutes     = require('./routes/products');
const categoryRoutes    = require('./routes/categories');
const taskRoutes        = require('./routes/tasks');
const deliveryRoutes    = require('./routes/deliveries');
const staffRoutes       = require('./routes/staff');
const reportRoutes      = require('./routes/reports');
const chatRoutes        = require('./routes/chat');
const webhookRoutes     = require('./routes/webhooks');
const inventoryRoutes   = require('./routes/inventory');
const expenditureRoutes = require('./routes/expenditures');
const reminderRoutes    = require('./routes/reminders');
const { setupChat } = require('./utils/socket');

const app = express();
const httpServer = createServer(app);

// Ensure upload directories exist
const fs = require('fs');
['uploads/products', 'uploads/deliveries'].forEach(dir => {
  const full = path.join(__dirname, '..', dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// ── CORS — supports multiple origins via comma-separated CORS_ORIGIN ──
// Example: CORS_ORIGIN=https://karel-pos.pages.dev,https://karel-site.pages.dev
const rawOrigin = process.env.CORS_ORIGIN || '*';
const allowedOrigins = rawOrigin === '*' ? '*' : rawOrigin.split(',').map(o => o.trim());

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }
});

function corsOriginFn(origin, callback) {
  // Allow requests with no origin (mobile apps, Postman, server-to-server)
  if (!origin) return callback(null, true);
  if (allowedOrigins === '*') return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  callback(new Error(`CORS blocked for origin: ${origin}`));
}

const corsOptions = {
  origin: corsOriginFn,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Must be before all routes
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Body parsers ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static uploads (fallback for local dev) ──
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Health check ──
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Debug: check Cloudinary config ──
app.get('/debug/cloudinary', (_req, res) => res.json({
  configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET',
  api_key_set: !!process.env.CLOUDINARY_API_KEY,
  api_secret_set: !!process.env.CLOUDINARY_API_SECRET,
}));

// ── Routes ──
app.use('/api/auth',         authRoutes);
app.use('/api/clients',      clientRoutes);
app.use('/api/orders',       orderRoutes);
app.use('/api/products',     productRoutes);
app.use('/api/categories',   categoryRoutes);
app.use('/api/tasks',        taskRoutes);
app.use('/api/deliveries',   deliveryRoutes);
app.use('/api/staff',        staffRoutes);
app.use('/api/reports',      reportRoutes);
app.use('/api/webhooks',     webhookRoutes);
app.use('/api/chat',         chatRoutes);
app.use('/api/inventory',    inventoryRoutes);
app.use('/api/expenditures', expenditureRoutes);
app.use('/api/reminders',    reminderRoutes);

// ── Socket.io chat ──
setupChat(io);

// ── 404 handler ──
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ──
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start server ──
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Karel backend running on port ${PORT}`);
  console.log(`CORS origins: ${rawOrigin}`);
});