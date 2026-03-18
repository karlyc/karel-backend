// src/routes/products.js
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');

// Helper: upload a file buffer, return URL
async function handlePhoto(file, folder) {
  if (!file) return undefined;
  if (isCloudinaryConfigured()) {
    return await uploadToCloudinary(file.buffer, folder);
  }
  // Fallback to base64
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

router.get('/', async (req, res) => {
  const { visible, categoryId, search } = req.query;
  const where = {};
  if (visible === 'true')  where.visible = true;
  if (visible === 'false') where.visible = false;
  if (categoryId) where.categoryId = categoryId;
  if (search) where.OR = [
    { name: { contains: search, mode: 'insensitive' } },
    { code: { contains: search, mode: 'insensitive' } },
  ];
  try {
    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        recipe: { include: { inventoryItem: { select: { name: true, unit: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(products);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true, recipe: { include: { inventoryItem: true } } },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireAuth, requireOffice,
  upload.fields([{ name:'photo1', maxCount:1 }, { name:'photo2', maxCount:1 }]),
  async (req, res) => {
    try {
      const { recipe: recipeRaw, ...fields } = req.body;
      const data = { ...fields };

      data.price  = parseFloat(data.price);
      if (data.width)  data.width  = parseFloat(data.width);
      else delete data.width;
      if (data.height) data.height = parseFloat(data.height);
      else delete data.height;
      data.visible = data.visible === 'true' || data.visible === true;

      const photo1 = await handlePhoto(req.files?.photo1?.[0], 'karel/products');
      const photo2 = await handlePhoto(req.files?.photo2?.[0], 'karel/products');
      if (photo1) data.photo1Url = photo1;
      if (photo2) data.photo2Url = photo2;

      const recipe = recipeRaw ? JSON.parse(recipeRaw) : [];

      const product = await prisma.product.create({
        data: {
          ...data,
          recipe: recipe.length > 0 ? {
            create: recipe.map(r => ({
              inventoryItemId: r.inventoryItemId,
              quantity: parseFloat(r.quantity) || 1,
            }))
          } : undefined,
        },
        include: { category: true, recipe: { include: { inventoryItem: true } } },
      });
      res.status(201).json(product);
    } catch(err) {
      console.error('POST product error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.put('/:id', requireAuth, requireOffice,
  upload.fields([{ name:'photo1', maxCount:1 }, { name:'photo2', maxCount:1 }]),
  async (req, res) => {
    try {
      const { recipe: recipeRaw, ...fields } = req.body;
      const data = { ...fields };

      if (data.price)  data.price  = parseFloat(data.price);
      if (data.width)  data.width  = parseFloat(data.width);  else if ('width'  in data) data.width  = null;
      if (data.height) data.height = parseFloat(data.height); else if ('height' in data) data.height = null;
      if (data.visible !== undefined) data.visible = data.visible === 'true' || data.visible === true;

      const photo1 = await handlePhoto(req.files?.photo1?.[0], 'karel/products');
      const photo2 = await handlePhoto(req.files?.photo2?.[0], 'karel/products');
      if (photo1) data.photo1Url = photo1;
      if (photo2) data.photo2Url = photo2;

      const recipe = recipeRaw !== undefined ? JSON.parse(recipeRaw) : null;

      await prisma.$transaction(async (tx) => {
        if (recipe !== null) {
          await tx.recipeItem.deleteMany({ where: { productId: req.params.id } });
          if (recipe.length > 0) {
            await tx.recipeItem.createMany({
              data: recipe.map(r => ({
                productId: req.params.id,
                inventoryItemId: r.inventoryItemId,
                quantity: parseFloat(r.quantity) || 1,
              }))
            });
          }
        }
        await tx.product.update({ where: { id: req.params.id }, data });
      });

      const product = await prisma.product.findUnique({
        where: { id: req.params.id },
        include: { category: true, recipe: { include: { inventoryItem: true } } },
      });
      res.json(product);
    } catch(err) {
      console.error('PUT product error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
