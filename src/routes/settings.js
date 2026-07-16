// src/routes/settings.js
// Simple key-value settings stored in DB via a JSON file approach
// Uses a Settings model or falls back to a JSON file
const router = require('express').Router();
const { requireAuth, requireOffice } = require('../middleware/auth');
const { upload, uploadToCloudinary, isCloudinaryConfigured } = require('../utils/upload');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

const DEFAULTS = {
  blockSundays: true,
  cutoffHour: 13,
  storeName: '', whatsapp: '', phone: '', address: '',
  rfc: '', website: '', email: '', logoUrl: '',
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch(e) {}
  return { ...DEFAULTS };
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// GET /api/settings — public so website can fetch
router.get('/', (req, res) => {
  res.json(loadSettings());
});

// PUT /api/settings — update settings (office+). Accepts JSON or multipart (logo upload).
router.put('/', requireAuth, requireOffice, upload.single('logo'), async (req, res) => {
  try {
    const current = loadSettings();
    const { blockSundays, cutoffHour, storeName, whatsapp, phone, address, rfc, website, email } = req.body;

    if (blockSundays !== undefined) current.blockSundays = blockSundays === true || blockSundays === 'true';
    if (cutoffHour !== undefined) {
      const n = Number(cutoffHour);
      if (!isNaN(n) && n >= 0 && n <= 23) current.cutoffHour = n;
    }
    if (storeName !== undefined) current.storeName = storeName;
    if (whatsapp  !== undefined) current.whatsapp  = whatsapp;
    if (phone     !== undefined) current.phone     = phone;
    if (address   !== undefined) current.address   = address;
    if (rfc       !== undefined) current.rfc       = rfc;
    if (website   !== undefined) current.website   = website;
    if (email     !== undefined) current.email     = email;

    if (req.file) {
      current.logoUrl = isCloudinaryConfigured()
        ? await uploadToCloudinary(req.file.buffer, 'karel/settings')
        : `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    saveSettings(current);
    res.json(current);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
