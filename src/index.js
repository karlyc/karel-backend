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
const { setupChat } = require('./utils/socket');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }
});

// ── Middleware ──
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Must be before all routes — handles preflight
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // explicitly handle preflight for all routes

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

// ── Health check ──
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

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
