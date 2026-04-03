// src/routes/contact.js
const router = require('express').Router();
const { sendContactEmail } = require('../utils/email');

router.post('/', async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;
    if (!name?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'Nombre y mensaje son requeridos' });
    }
    const result = await sendContactEmail({ name, phone, email, subject, message });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Contact] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
