// src/utils/storeTime.js — timezone-aware "today" for the store, independent of the
// server host's timezone (Railway runs in UTC, the store is in Ciudad Juárez).
const STORE_TZ = 'America/Ciudad_Juarez';

// "YYYY-MM-DD" for right now, in the STORE's timezone — not the server host's.
function todayInStoreTZ() {
  return new Date().toLocaleDateString('en-CA', { timeZone: STORE_TZ });
}

// The store timezone's UTC offset (in minutes) at a given instant, via Intl — handles
// DST correctly without adding a date library dependency.
function storeTzOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// UTC instant range [gte, lt) for one calendar day (YYYY-MM-DD) *in store-local time* —
// for comparing against real timestamps like createdAt. (deliveryDate needs no conversion —
// it's already stored as UTC-midnight-representing-the-calendar-day by convention.)
function storeDayRangeUTC(dateStr) {
  const naiveUTC = new Date(`${dateStr}T00:00:00.000Z`);
  const offsetMin = storeTzOffsetMinutes(naiveUTC);
  const gte = new Date(naiveUTC.getTime() - offsetMin * 60000);
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

module.exports = { STORE_TZ, todayInStoreTZ, storeDayRangeUTC };
