// src/routes/accessories.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');

async function handlePhoto(file) {
  if (!file) return undefined;
  if (isCloudinaryConfigured()) return await uploadToCloudinary(file.buffer, 'karel/accessories');
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

// GET /api/accessories — ?typeId=&visible=&search=
router.get('/', async (req, res) => {
  const { typeId, visible, search } = req.query;
  const where = {};
  if (typeId) where.typeId = typeId;
  if (visible === 'true')  where.visible = true;
  if (visible === 'false') where.visible = false;
  if (search) where.name = { contains: search, mode: 'insensitive' };
  try {
    const accessories = await prisma.accessory.findMany({
      where,
      include: { type: true, variants: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(accessories);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const accessory = await prisma.accessory.findUnique({
      where: { id: req.params.id },
      include: { type: true, variants: true },
    });
    if (!accessory) return res.status(404).json({ error: 'Accessory not found' });
    res.json(accessory);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/accessories — multipart: fields `data` (JSON) + photo_0, photo_1, ...
router.post('/', requireAuth, requireOffice, upload.any(), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.data || '{}');
    const { typeId, name, color, occasion, occasionOther, variants = [] } = payload;
    if (!typeId || !name) return res.status(400).json({ error: 'typeId y name son requeridos' });
    if (!variants.length) return res.status(400).json({ error: 'Al menos una variante (precio) es requerida' });

    const filesByField = {};
    (req.files || []).forEach(f => { filesByField[f.fieldname] = f; });

    const variantData = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const photoUrl = await handlePhoto(filesByField[`photo_${i}`]);
      variantData.push({
        sizeLabel: v.sizeLabel || null,
        price: parseFloat(v.price) || 0,
        photoUrl: photoUrl || null,
      });
    }

    const accessory = await prisma.accessory.create({
      data: {
        typeId, name,
        color: color || null,
        occasion: occasion || null,
        occasionOther: occasionOther || null,
        variants: { create: variantData },
      },
      include: { type: true, variants: true },
    });
    res.status(201).json(accessory);
  } catch (err) {
    console.error('POST accessory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/accessories/:id — same shape, replaces variants
router.put('/:id', requireAuth, requireOffice, upload.any(), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.data || '{}');
    const { typeId, name, color, occasion, occasionOther, variants, visible } = payload;

    const filesByField = {};
    (req.files || []).forEach(f => { filesByField[f.fieldname] = f; });

    const data = {};
    if (typeId !== undefined) data.typeId = typeId;
    if (name !== undefined) data.name = name;
    if (color !== undefined) data.color = color || null;
    if (occasion !== undefined) data.occasion = occasion || null;
    if (occasionOther !== undefined) data.occasionOther = occasionOther || null;
    if (visible !== undefined) data.visible = !!visible;

    await prisma.$transaction(async (tx) => {
      if (Array.isArray(variants)) {
        const existing = await tx.accessoryVariant.findMany({ where: { accessoryId: req.params.id } });
        const existingByIndex = existing; // preserve existing photo when no new file provided
        const variantData = [];
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          const uploaded = await handlePhoto(filesByField[`photo_${i}`]);
          const photoUrl = uploaded !== undefined ? uploaded : (v.photoUrl || existingByIndex[i]?.photoUrl || null);
          variantData.push({
            sizeLabel: v.sizeLabel || null,
            price: parseFloat(v.price) || 0,
            photoUrl,
          });
        }
        await tx.accessoryVariant.deleteMany({ where: { accessoryId: req.params.id } });
        await tx.accessoryVariant.createMany({
          data: variantData.map(v => ({ ...v, accessoryId: req.params.id })),
        });
      }
      await tx.accessory.update({ where: { id: req.params.id }, data });
    });

    const accessory = await prisma.accessory.findUnique({
      where: { id: req.params.id },
      include: { type: true, variants: true },
    });
    res.json(accessory);
  } catch (err) {
    console.error('PUT accessory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/accessories/:id/visible
router.patch('/:id/visible', requireAuth, requireOffice, async (req, res) => {
  try {
    const accessory = await prisma.accessory.update({
      where: { id: req.params.id },
      data: { visible: !!req.body.visible },
    });
    res.json(accessory);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
