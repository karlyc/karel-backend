// src/jobs/monthlyReportJob.js — emails the finished month's report on the 1st of the next month
const cron = require('node-cron');
const { sendMonthlyReportEmail } = require('../utils/email');

function scheduleMonthlyReportEmail() {
  // 07:00 on day 1 of every month, store-local time
  cron.schedule('0 7 1 * *', async () => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prev.getFullYear();
    const month = prev.getMonth() + 1;
    try {
      const result = await sendMonthlyReportEmail(year, month);
      console.log(`[Cron] Monthly report (${month}/${year}):`, result);
    } catch (err) {
      console.error('[Cron] Monthly report failed:', err.message);
    }
  }, { timezone: 'America/Ciudad_Juarez' });
}

module.exports = { scheduleMonthlyReportEmail };
