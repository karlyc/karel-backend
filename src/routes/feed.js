// src/routes/feed.js
// Google Merchant Center RSS/Atom product feed
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STORE_URL = process.env.SITE_URL || 'https://floreriakarel.com';
const CURRENCY  = 'MXN';
const BRAND     = 'Florería y Regalos Karel';
const CONDITION = 'new';
const AVAILABILITY = 'in stock';

function escXML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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
      const productUrl = `${STORE_URL}?categoria=${encodeURIComponent(category.toLowerCase())}`;

      return `
    <item>
      <g:id>${escXML(p.id)}</g:id>
      <g:title>${escXML(p.name)}</g:title>
      <g:description>${escXML(p.description || `${p.name} — Florería y Regalos Karel, Ciudad Juárez`)}</g:description>
      <g:link>${escXML(productUrl)}</g:link>
      ${imageUrl ? `<g:image_link>${escXML(imageUrl)}</g:image_link>` : ''}
      <g:price>${price} ${CURRENCY}</g:price>
      <g:availability>${AVAILABILITY}</g:availability>
      <g:condition>${CONDITION}</g:condition>
      <g:brand>${escXML(BRAND)}</g:brand>
      <g:google_product_category>5886</g:google_product_category>
      <g:product_type>${escXML(category)}</g:product_type>
      <g:identifier_exists>no</g:identifier_exists>
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

module.exports = router;
