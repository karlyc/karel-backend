// src/routes/tasks.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const where = req.query.completed === 'true' ? {} : { completed: false };
  try {
    const tasks = await prisma.task.findMany({
      where, orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
      include: { order: { select: { orderNumber: true } } },
    });
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch tasks' }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const task = await prisma.task.create({ data: req.body });
    res.status(201).json(task);
  } catch (err) { res.status(500).json({ error: 'Failed to create task' }); }
});

router.patch('/:id/complete', requireAuth, async (req, res) => {
  try {
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { completed: true, completedAt: new Date() },
    });
    res.json(task);
  } catch (err) { res.status(500).json({ error: 'Failed to complete task' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete task' }); }
});

module.exports = router;
