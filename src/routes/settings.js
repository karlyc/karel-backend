// src/routes/settings.js
// Store settings — persisted in Postgres as a singleton row (id: 'singleton'),
// same durability as product/category photo URLs. Not a flat disk file: on an
// ephemeral container filesystem (e.g. Railway redeploys) a disk file gets wiped,
// which is why the logo used to disappear after every deploy.
const router = require('express').Router();
const { prisma } = require('../db/prisma');
const { requireAuth, requireOffice } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');

const SETTINGS_ID = 'singleton';

const DEFAULTS = {
  blockSundays: true,
  cutoffHour: 13,
  ivaRate: 8,
  storeName: '', whatsapp: '', phone: '', address: '',
  rfc: '', website: '', email: '', logoUrl: '',
};

async function loadSettings() {
  const row = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID, ...DEFAULTS },
  });
  const { id, updatedAt, ...rest } = row;
  return rest;
}

// GET /api/settings — public so website can fetch
router.get('/', async (req, res) => {
  try {
    res.json(await loadSettings());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/settings — update settings (office+). Accepts JSON or multipart (logo upload).
router.put('/', requireAuth, requireOffice, upload.single('logo'), async (req, res) => {
  try {
    const { blockSundays, cutoffHour, ivaRate, storeName, whatsapp, phone, address, rfc, website, email } = req.body;
    const data = {};

    if (blockSundays !== undefined) data.blockSundays = blockSundays === true || blockSundays === 'true';
    if (cutoffHour !== undefined) {
      const n = Number(cutoffHour);
      if (!isNaN(n) && n >= 0 && n <= 23) data.cutoffHour = n;
    }
    if (ivaRate !== undefined) {
      const n = Number(ivaRate);
      if (!isNaN(n) && n >= 0 && n <= 100) data.ivaRate = n;
    }
    if (storeName !== undefined) data.storeName = storeName;
    if (whatsapp  !== undefined) data.whatsapp  = whatsapp;
    if (phone     !== undefined) data.phone     = phone;
    if (address   !== undefined) data.address   = address;
    if (rfc       !== undefined) data.rfc       = rfc;
    if (website   !== undefined) data.website   = website;
    if (email     !== undefined) data.email     = email;

    if (req.file) {
      data.logoUrl = isCloudinaryConfigured()
        ? await uploadToCloudinary(req.file.buffer, 'karel/settings')
        : `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const row = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...DEFAULTS, ...data },
    });
    const { id, updatedAt, ...rest } = row;
    res.json(rest);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.loadSettings = loadSettings;
