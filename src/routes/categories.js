// src/routes/categories.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');

// GET /api/categories
router.get('/', async (req, res) => {
  const where = req.query.visible === 'true' ? { visible: true } : {};
  try {
    const cats = await prisma.category.findMany({
      where, orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { products: true } },
        products: {
          select: { id: true, name: true, code: true, photo1Url: true, visible: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    res.json(cats);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch categories' }); }
});

// POST /api/categories (with optional photo)
router.post('/', requireAuth, requireOffice, upload.single('photo'), async (req, res) => {
  try {
    let photoUrl = null;
    if (req.file) {
      photoUrl = isCloudinaryConfigured()
        ? await uploadToCloudinary(req.file.buffer, 'karel/categories')
        : `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    const { name, description, visible, sortOrder } = req.body;
    const cat = await prisma.category.create({
      data: {
        name,
        description: description || null,
        photoUrl: photoUrl || null,
        visible: visible === 'false' ? false : true,
        sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      },
    });
    res.status(201).json(cat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/categories/:id (with optional photo)
router.put('/:id', requireAuth, requireOffice, upload.single('photo'), async (req, res) => {
  try {
    let photoUrl;
    if (req.file) {
      photoUrl = isCloudinaryConfigured()
        ? await uploadToCloudinary(req.file.buffer, 'karel/categories')
        : `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    const { name, description, visible, sortOrder, productIds } = req.body;

    // Update category fields
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description || null;
    if (visible !== undefined) data.visible = visible === 'false' ? false : Boolean(visible);
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder);
    if (photoUrl !== undefined) data.photoUrl = photoUrl;

    const cat = await prisma.category.update({
      where: { id: req.params.id },
      data,
    });

    // If productIds sent, reassign products to this category
    if (productIds) {
      const ids = JSON.parse(productIds);
      // Remove all products from this category first, then re-add selected ones
      await prisma.product.updateMany({
        where: { categoryId: req.params.id },
        data: { categoryId: null },
      });
      if (ids.length > 0) {
        await prisma.product.updateMany({
          where: { id: { in: ids } },
          data: { categoryId: req.params.id },
        });
      }
    }

    res.json(cat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/categories/:id
router.delete('/:id', requireAuth, requireOffice, async (req, res) => {
  try {
    // Unassign products from this category before deleting
    await prisma.product.updateMany({
      where: { categoryId: req.params.id },
      data: { categoryId: null },
    });
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
