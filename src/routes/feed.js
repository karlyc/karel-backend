// src/routes/feed.js
// Google Merchant Center RSS/Atom product feed + Local Inventory feed
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STORE_URL   = process.env.SITE_URL || 'https://floreriakarel.com';
const CURRENCY    = 'MXN';
const BRAND       = 'Florería y Regalos Karel';
const STORE_CODE  = 'karel-juarez-01'; // must match store code in Google Business Profile

function escXML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Main product feed ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { visible: true },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });

    const items = products.map(p => {
      const imageUrl = p.photo1Url
        ? (p.photo1Url.startsWith('http') ? p.photo1Url : `${STORE_URL}${p.photo1Url}`)
        : '';
      const category = p.category?.name || 'Flores y Arreglos';
      const price = Number(p.price || 0).toFixed(2);
      const productUrl = `${STORE_URL}?producto=${encodeURIComponent(p.code || p.id)}`;

      return `
    <item>
      <g:id>${escXML(p.code || p.id)}</g:id>
      <g:title>${escXML(p.name)}</g:title>
      <g:description>${escXML(p.description || `${p.name} — Florería y Regalos Karel, Ciudad Juárez`)}</g:description>
      <g:link>${escXML(productUrl)}</g:link>
      ${imageUrl ? `<g:image_link>${escXML(imageUrl)}</g:image_link>` : ''}
      <g:price>${price} ${CURRENCY}</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:brand>${escXML(BRAND)}</g:brand>
      <g:google_product_category>5886</g:google_product_category>
      <g:product_type>${escXML(category)}</g:product_type>
      <g:identifier_exists>no</g:identifier_exists>
      <g:store_code>${STORE_CODE}</g:store_code>
      <g:shipping>
        <g:country>MX</g:country>
        <g:price>125.00 MXN</g:price>
      </g:shipping>
    </item>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Florería y Regalos Karel</title>
    <link>${STORE_URL}</link>
    <description>Arreglos florales frescos en Ciudad Juárez — Entrega el mismo día</description>
    ${items}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch(e) {
    console.error('[Feed] Error:', e.message);
    res.status(500).send('Error generating feed');
  }
});

// ── Local inventory feed ───────────────────────────────────────
router.get('/local-inventory', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { visible: true },
      orderBy: { createdAt: 'desc' },
    });

    const items = products.map(p => {
      const price = Number(p.price || 0).toFixed(2);
      return `
    <item>
      <g:store_code>${STORE_CODE}</g:store_code>
      <g:item_id>${escXML(p.code || p.id)}</g:item_id>
      <g:quantity>10</g:quantity>
      <g:availability>in_stock</g:availability>
      <g:price>${price} ${CURRENCY}</g:price>
    </item>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Karel Local Inventory — ${STORE_CODE}</title>
    <link>${STORE_URL}</link>
    <description>Local inventory for Florería y Regalos Karel</description>
    ${items}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch(e) {
    console.error('[Feed Local] Error:', e.message);
    res.status(500).send('Error generating local inventory feed');
  }
});

module.exports = router;
