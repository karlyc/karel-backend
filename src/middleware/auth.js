// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { prisma } = require('../db/prisma');

// Verify JWT and attach staff to req
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const staff = await prisma.staff.findUnique({ where: { id: payload.staffId } });
    if (!staff || !staff.active) {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }
    req.staff = staff;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restrict to specific roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.staff?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Admin only (ADMIN role)
const requireAdmin = requireRole('ADMIN');

// Office or above
const requireOffice = requireRole('ADMIN', 'OFFICE');

module.exports = { requireAuth, requireRole, requireAdmin, requireOffice };
