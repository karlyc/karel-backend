// src/routes/inventory.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');

async function handlePhoto(file) {
  if (!file) return undefined;
  if (isCloudinaryConfigured()) return await uploadToCloudinary(file.buffer, 'karel/inventory');
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
    res.json(items);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const { name, unit, quantity, minStock, cost, unitsPerPurchase, category, supplier, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
    const photoUrl = await handlePhoto(req.file);
    const item = await prisma.inventoryItem.create({
      data: {
        name: name.trim(), unit: unit || 'pza',
        category: category || null,
        quantity: parseFloat(quantity) || 0,
        minStock: parseFloat(minStock) || 0,
        cost: cost ? parseFloat(cost) : null,
        unitsPerPurchase: unitsPerPurchase ? parseFloat(unitsPerPurchase) : null,
        supplier: supplier || null,
        notes: notes || null,
        photoUrl: photoUrl || null,
      },
    });
    res.status(201).json(item);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const { name, unit, quantity, minStock, cost, unitsPerPurchase, category, supplier, notes } = req.body;
    const data = {
      name: name?.trim(), unit,
      category: category || null,
      quantity: quantity !== undefined ? parseFloat(quantity) : undefined,
      minStock: minStock !== undefined ? parseFloat(minStock) : undefined,
      cost: cost ? parseFloat(cost) : null,
      unitsPerPurchase: unitsPerPurchase ? parseFloat(unitsPerPurchase) : null,
      supplier: supplier || null,
      notes: notes || null,
    };
    const photoUrl = await handlePhoto(req.file);
    if (photoUrl) data.photoUrl = photoUrl;
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.patch('/:id/stock', requireAuth, async (req, res) => {
  const { delta } = req.body;
  try {
    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: { quantity: { increment: parseFloat(delta) } },
    });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
