// src/routes/settings.js
// Simple key-value settings stored in DB via a JSON file approach
// Uses a Settings model or falls back to a JSON file
const router = require('express').Router();
const { requireAuth, requireOffice } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch(e) {}
  return { blockSundays: true, cutoffHour: 13 };
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// GET /api/settings — public so website can fetch
router.get('/', (req, res) => {
  res.json(loadSettings());
});

// PUT /api/settings — update settings (office+)
router.put('/', requireAuth, requireOffice, (req, res) => {
  try {
    const current = loadSettings();
    const { blockSundays, cutoffHour } = req.body;
    if (typeof blockSundays === 'boolean') current.blockSundays = blockSundays;
    if (typeof cutoffHour === 'number' && cutoffHour >= 0 && cutoffHour <= 23) current.cutoffHour = cutoffHour;
    saveSettings(current);
    res.json(current);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
