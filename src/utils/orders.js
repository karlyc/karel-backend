// src/utils/orders.js

// Generate sequential order number like KAR-2049
// Takes the max numeric suffix among well-formed "KAR-<digits>" numbers, rather than just
// incrementing whatever order has the latest createdAt — a differently-formatted orderNumber
// (e.g. a manually-inserted test row) must not derail the sequence with a non-numeric suffix.
async function generateOrderNumber(tx) {
  const [row] = await tx.$queryRaw`
    SELECT MAX(CAST(SUBSTRING("orderNumber" FROM 5) AS INTEGER)) AS max
    FROM "Order"
    WHERE "orderNumber" ~ '^KAR-[0-9]+$'
  `;
  const max = row?.max;
  return `KAR-${(max ? Number(max) : 1000) + 1}`;
}

// Compute loyalty tier based on total order count
function computeLoyaltyTier(orderCount) {
  if (orderCount >= 30) return 'PLATINUM';
  if (orderCount >= 20) return 'VIP';
  if (orderCount >= 10) return 'FREQUENT';
  return 'REGULAR';
}

module.exports = { generateOrderNumber, computeLoyaltyTier };
