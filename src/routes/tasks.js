// src/routes/tasks.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { completed, staffId } = req.query;
  const where = {};
  // Non-completed filter
  if (completed !== 'true') where.completed = false;
  // Filter by assigned user OR global tasks (assignedToId = null)
  // Everyone sees their own tasks + global tasks
  if (staffId) {
    where.OR = [{ assignedToId: staffId }, { assignedToId: null }];
  }
  try {
    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
      include: { order: { select: { orderNumber: true } } },
    });
    res.json(tasks);
  } catch(err) {
    console.error('GET tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { description, dueDate, orderId, assignedToId } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'La descripción es requerida' });
  try {
    const task = await prisma.task.create({
      data: {
        description: description.trim(),
        dueDate: dueDate ? new Date(dueDate) : null,
        orderId: orderId || null,
        assignedToId: assignedToId || null,
      },
    });
    res.status(201).json(task);
  } catch(err) {
    console.error('POST task error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/complete', requireAuth, async (req, res) => {
  try {
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { completed: true, completedAt: new Date() },
    });
    res.json(task);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ message: 'Task deleted' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
