# 🌹 Florería y Regalos Karel — Backend

Node.js + Express + PostgreSQL + Prisma + Socket.io

---

## Project Structure

```
karel-backend/
├── prisma/
│   ├── schema.prisma      # Database models
│   └── seed.js            # Initial data (admin, products, categories)
├── src/
│   ├── index.js           # App entry point + Socket.io
│   ├── db/
│   │   └── prisma.js      # Prisma client singleton
│   ├── middleware/
│   │   └── auth.js        # JWT auth + role guards
│   ├── routes/
│   │   ├── auth.js        # POST /login, GET /me, PUT /pin
│   │   ├── orders.js      # Full order CRUD + status/payment updates
│   │   ├── clients.js     # Client lookup, create, update
│   │   ├── products.js    # Product CRUD + photo upload
│   │   ├── categories.js  # Category management
│   │   ├── deliveries.js  # Assign repartidor, confirm delivery
│   │   ├── tasks.js       # Task CRUD + complete
│   │   ├── staff.js       # Staff management (admin only)
│   │   ├── reports.js     # Daily / monthly / range reports
│   │   ├── chat.js        # Chat session REST endpoints
│   │   └── webhooks.js    # Stripe webhook (web payments)
│   └── utils/
│       ├── orders.js      # Order number generator, loyalty tier
│       └── socket.js      # Socket.io real-time chat (web ↔ POS)
└── .env.example
```

---

## Quick Setup (Local)

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# 3. Push schema to database
npm run db:push

# 4. Seed initial data (admin, categories, products)
npm run db:seed

# 5. Start dev server
npm run dev
```

---

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a **PostgreSQL** service to the project
4. Railway auto-sets `DATABASE_URL` — copy it to your app's environment variables
5. Add the remaining env vars (JWT_SECRET, etc.) in Railway's Variables tab
6. Railway will auto-deploy on every push to main

## Deploy to Render

1. Push to GitHub
2. New Web Service → connect repo
3. Build command: `npm install && npm run db:push && npm run db:seed`
4. Start command: `npm start`
5. Add a **PostgreSQL** database → copy the connection string to `DATABASE_URL`

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with `{ pin, staffId? }` → JWT token |
| GET  | `/api/auth/me` | Get current staff info |
| PUT  | `/api/auth/pin` | Change PIN |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/orders` | List with filters: `search`, `orderStatus`, `paymentStatus`, `date` |
| GET    | `/api/orders/:id` | Order detail |
| POST   | `/api/orders` | Create order |
| PATCH  | `/api/orders/:id/status` | Update order status |
| PATCH  | `/api/orders/:id/payment` | Mark payment received/paid (office+) |
| DELETE | `/api/orders/:id` | Cancel order (admin only) |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/clients?search=` | Search clients |
| GET  | `/api/clients/:id` | Client detail + order history |
| POST | `/api/clients` | Create client |
| PUT  | `/api/clients/:id` | Update client |

### Deliveries
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/deliveries/today` | Today's deliveries for dashboard |
| GET  | `/api/deliveries/tomorrow` | Tomorrow's deliveries |
| GET  | `/api/deliveries/assigned/:staffId` | Repartidor's assigned deliveries |
| PATCH | `/api/deliveries/:orderId/assign` | Assign to repartidor |
| POST  | `/api/deliveries/:orderId/confirm` | Confirm delivery (photo + receivedBy) |

### Reports (admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/daily?date=YYYY-MM-DD` | Daily report |
| GET | `/api/reports/monthly?year=&month=` | Monthly report |
| GET | `/api/reports/range?from=&to=` | Date range report |
| GET | `/api/reports/pending-payments` | All pending credit orders |

### Socket.io
- Connect to `/pos` namespace (staff) or `/web` namespace (website visitors)
- Events: `staff:message`, `visitor:message`, `visitor:join`, `notification:chat`

---

## Payment Status Logic

| Status | When |
|--------|------|
| `PAGO_RECIBIDO` | Order created in POS with any non-credit payment method |
| `PENDIENTE` | Order created as Crédito |
| `PAGADA` | Web order paid via Stripe, or admin manually approves |

## Order Status Flow

```
EN_PROCESO  →  POR_ENTREGAR  →  COMPLETADA
  (created)    (florista done)  (delivered)
```
