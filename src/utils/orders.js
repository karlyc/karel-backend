// src/utils/orders.js

// Generate sequential order number like KAR-2049
async function generateOrderNumber(tx) {
  const last = await tx.order.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!last) return 'KAR-1001';
  const num = parseInt(last.orderNumber.split('-')[1], 10);
  return `KAR-${num + 1}`;
}

// Compute loyalty tier based on total order count
function computeLoyaltyTier(orderCount) {
  if (orderCount >= 30) return 'PLATINUM';
  if (orderCount >= 20) return 'VIP';
  if (orderCount >= 10) return 'FREQUENT';
  return 'REGULAR';
}

module.exports = { generateOrderNumber, computeLoyaltyTier };
