// src/routes/accessoryTypes.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');

const DEFAULT_TYPES = [
  { name: 'Banda',          hasColor: true,  hasOccasion: false, hasSizes: false, sortOrder: 1 },
  { name: 'Peluche',        hasColor: false, hasOccasion: false, hasSizes: true,  sortOrder: 2 },
  { name: 'Chocolates',     hasColor: false, hasOccasion: false, hasSizes: true,  sortOrder: 3 },
  { name: 'Globo Metálico', hasColor: false, hasOccasion: true,  hasSizes: false, sortOrder: 4 },
];

// GET /api/accessory-types — public, lazy-seeds the 4 defaults on first use
router.get('/', async (req, res) => {
  try {
    const count = await prisma.accessoryType.count();
    if (count === 0) {
      await prisma.accessoryType.createMany({ data: DEFAULT_TYPES });
    }
    const types = await prisma.accessoryType.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(types);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/accessory-types — create a new custom accessory type
router.post('/', requireAuth, requireOffice, async (req, res) => {
  try {
    const { name, hasColor, hasOccasion, hasSizes } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
    const maxSort = await prisma.accessoryType.aggregate({ _max: { sortOrder: true } });
    const type = await prisma.accessoryType.create({
      data: {
        name,
        hasColor: !!hasColor,
        hasOccasion: !!hasOccasion,
        hasSizes: !!hasSizes,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });
    res.status(201).json(type);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
