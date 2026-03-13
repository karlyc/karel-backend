// src/utils/socket.js
const { prisma } = require('../db/prisma');

function setupChat(io) {
  // Separate namespaces: /pos for staff, /web for website visitors
  const posNS = io.of('/pos');
  const webNS = io.of('/web');

  posNS.on('connection', (socket) => {
    console.log(`[POS] Staff connected: ${socket.id}`);

    // Staff sends message to a visitor session
    socket.on('staff:message', async ({ sessionId, text, staffId }) => {
      try {
        const msg = await prisma.chatMessage.create({
          data: { sessionId, fromStaff: true, staffId, text },
        });
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() },
        });
        // Broadcast to that session's room on both namespaces
        posNS.to(sessionId).emit('message', msg);
        webNS.to(sessionId).emit('message', msg);
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('staff:join', (sessionId) => socket.join(sessionId));
    socket.on('disconnect', () => console.log(`[POS] Staff disconnected: ${socket.id}`));
  });

  webNS.on('connection', (socket) => {
    console.log(`[WEB] Visitor connected: ${socket.id}`);

    socket.on('visitor:join', (sessionId) => {
      socket.join(sessionId);
      // Notify POS staff of new message
      posNS.emit('session:active', { sessionId });
    });

    socket.on('visitor:message', async ({ sessionId, text }) => {
      try {
        const msg = await prisma.chatMessage.create({
          data: { sessionId, fromStaff: false, text },
        });
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() },
        });
        webNS.to(sessionId).emit('message', msg);
        posNS.emit('message', { ...msg, sessionId }); // broadcast to all POS staff
        posNS.emit('notification:chat', { sessionId, text }); // badge ping
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => console.log(`[WEB] Visitor disconnected: ${socket.id}`));
  });
}

module.exports = { setupChat };
