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

// POST /api/chat/sessions — website visitor starts a chat
router.post('/sessions', async (req, res) => {
  const { visitorId, visitorName } = req.body;
  if (!visitorId) return res.status(400).json({ error: 'visitorId required' });
  try {
    let session = await prisma.chatSession.findFirst({ where: { visitorId, resolved: false } });
    if (!session) {
      session = await prisma.chatSession.create({ data: { visitorId, visitorName } });
    }
    res.json(session);
  } catch (err) { res.status(500).json({ error: 'Failed to create session' }); }
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
