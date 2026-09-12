require('dotenv').config();
const app = require('./src/app');
const HostingService = require('./src/hostingService');

const PORT = process.env.PORT || 3000;

// Run automated suspension check every 24 hours or on server start
setInterval(() => {
  console.log('[CRON] Executando verificação de contas com 7+ dias de atraso...');
  try {
    const res = HostingService.checkOverdueAndSuspendAccounts(7);
    console.log(`[CRON] Verificação concluída. ${res.suspended_accounts.length} contas suspensas.`);
  } catch (err) {
    console.error('[CRON] Erro na verificação:', err.message);
  }
}, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server rodando em http://localhost:${PORT}`);
});
