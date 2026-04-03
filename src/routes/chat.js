// src/routes/chat.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

// GET /api/chat/sessions — all open sessions (POS staff)
router.get('/sessions', requireAuth, async (_req, res) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { resolved: false },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch sessions' }); }
});

// GET /api/chat/sessions/:id/messages
router.get('/sessions/:id/messages', requireAuth, async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch messages' }); }
});

// POST /api/chat/sessions — website visitor starts or finds a session
router.post('/sessions', async (req, res) => {
  const { visitorId, visitorName, text } = req.body;
  if (!visitorId) return res.status(400).json({ error: 'visitorId required' });
  try {
    let session = await prisma.chatSession.findFirst({ where: { visitorId, resolved: false } });
    if (!session) {
      session = await prisma.chatSession.create({ data: { visitorId, visitorName } });
    }
    // If a message was included, save it
    if (text?.trim()) {
      await prisma.chatMessage.create({
        data: { sessionId: session.id, text: text.trim(), fromStaff: false },
      });
      await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
    }
    res.json(session);
  } catch (err) { res.status(500).json({ error: 'Failed to create session' }); }
});

// POST /api/chat/sessions/:id/messages — send a message (staff or visitor)
router.post('/sessions/:id/messages', async (req, res) => {
  const { text, fromStaff, staffId } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  try {
    const message = await prisma.chatMessage.create({
      data: {
        sessionId: req.params.id,
        text: text.trim(),
        fromStaff: fromStaff || false,
        staffId: staffId || null,
      },
    });
    // Bump session updatedAt so it appears at top of list
    await prisma.chatSession.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    res.status(201).json(message);
  } catch (err) { res.status(500).json({ error: 'Failed to save message' }); }
});

// GET /api/chat/sessions/:id/messages/since — poll for new messages since a timestamp
router.get('/sessions/:id/messages/since', async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : new Date(0);
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: req.params.id, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch messages' }); }
});

// PATCH /api/chat/sessions/:id/resolve
router.patch('/sessions/:id/resolve', requireAuth, async (req, res) => {
  try {
    const session = await prisma.chatSession.update({
      where: { id: req.params.id },
      data: { resolved: true },
    });
    res.json(session);
  } catch (err) { res.status(500).json({ error: 'Failed to resolve session' }); }
});

module.exports = router;
