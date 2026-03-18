// src/routes/products.js
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(__dirname,'../../uploads/products')),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        recipe: { include: { inventoryItem: true } },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.post('/', requireAuth, requireOffice, upload.fields([
  { name: 'photo1', maxCount: 1 },
  { name: 'photo2', maxCount: 1 },
]), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.files?.photo1) data.photo1Url = `/uploads/products/${req.files.photo1[0].filename}`;
    if (req.files?.photo2) data.photo2Url = `/uploads/products/${req.files.photo2[0].filename}`;
    data.price  = parseFloat(data.price);
    if (data.width)  data.width  = parseFloat(data.width);
    if (data.height) data.height = parseFloat(data.height);
    data.visible = data.visible === 'true' || data.visible === true;

    // Handle recipe items
    const recipe = data.recipe ? JSON.parse(typeof data.recipe === 'string' ? data.recipe : JSON.stringify(data.recipe)) : [];
    delete data.recipe;

    const product = await prisma.product.create({
      data: {
        ...data,
        recipe: recipe.length > 0 ? {
          create: recipe.map(r => ({
            inventoryItemId: r.inventoryItemId,
            quantity: parseFloat(r.quantity) || 1,
            notes: r.notes || null,
          }))
        } : undefined,
      },
      include: { category: true, recipe: { include: { inventoryItem: true } } },
    });
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/:id', requireAuth, requireOffice, upload.fields([
  { name: 'photo1', maxCount: 1 },
  { name: 'photo2', maxCount: 1 },
]), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.files?.photo1) data.photo1Url = `/uploads/products/${req.files.photo1[0].filename}`;
    if (req.files?.photo2) data.photo2Url = `/uploads/products/${req.files.photo2[0].filename}`;
    if (data.price)  data.price  = parseFloat(data.price);
    if (data.width)  data.width  = parseFloat(data.width);
    if (data.height) data.height = parseFloat(data.height);
    if (data.visible !== undefined) data.visible = data.visible === 'true' || data.visible === true;

    // Handle recipe — delete existing and recreate
    const recipe = data.recipe ? JSON.parse(typeof data.recipe === 'string' ? data.recipe : JSON.stringify(data.recipe)) : null;
    delete data.recipe;

    await prisma.$transaction(async (tx) => {
      if (recipe !== null) {
        await tx.recipeItem.deleteMany({ where: { productId: req.params.id } });
        if (recipe.length > 0) {
          await tx.recipeItem.createMany({
            data: recipe.map(r => ({
              productId: req.params.id,
              inventoryItemId: r.inventoryItemId,
              quantity: parseFloat(r.quantity) || 1,
              notes: r.notes || null,
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

module.exports = router;
