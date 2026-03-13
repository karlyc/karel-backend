// src/routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../db/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// POST /api/auth/login
// Staff login with PIN
router.post('/login', [
  body('pin').isLength({ min: 4, max: 8 }).withMessage('PIN must be 4–8 digits'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { pin, staffId } = req.body;

  try {
    // If staffId provided, look up that staff member; otherwise find admin
    let staff;
    if (staffId) {
      staff = await prisma.staff.findUnique({ where: { id: staffId } });
    } else {
      // For admin PIN entry on the PIN pad (no staffId)
      staff = await prisma.staff.findFirst({ where: { role: 'ADMIN', active: true } });
    }

    if (!staff || !staff.active) {
      return res.status(401).json({ error: 'Staff not found or inactive' });
    }

    const valid = await bcrypt.compare(pin, staff.pin);
    if (!valid) return res.status(401).json({ error: 'Incorrect PIN' });

    const token = jwt.sign(
      { staffId: staff.id, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      staff: { id: staff.id, name: staff.name, role: staff.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
// Return current staff info
router.get('/me', requireAuth, (req, res) => {
  const { id, name, role } = req.staff;
  res.json({ id, name, role });
});

// PUT /api/auth/pin
// Change PIN (admin only, or staff changing their own)
router.put('/pin', requireAuth, [
  body('currentPin').notEmpty(),
  body('newPin').isLength({ min: 4, max: 8 }).withMessage('PIN must be 4–8 digits'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { currentPin, newPin, targetStaffId } = req.body;
  const staffId = targetStaffId || req.staff.id;

  // Only admins can change other people's PINs
  if (targetStaffId && req.staff.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can change other staff PINs' });
  }

  try {
    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const valid = await bcrypt.compare(currentPin, staff.pin);
    if (!valid) return res.status(401).json({ error: 'Current PIN incorrect' });

    const hashed = await bcrypt.hash(newPin, 10);
    await prisma.staff.update({ where: { id: staffId }, data: { pin: hashed } });

    res.json({ message: 'PIN updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update PIN' });
  }
});

module.exports = router;
