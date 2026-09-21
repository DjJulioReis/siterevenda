const express = require('express');
const cors = require('cors');
const path = require('path');
const HostingService = require('./hostingService');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Stats overview
app.get('/api/stats', (req, res) => {
  try {
    const clients = HostingService.getAllClients();
    const accounts = HostingService.getAllHostingAccounts();
    const invoices = HostingService.getAllInvoices();

    const activeAccounts = accounts.filter(a => a.status === 'active').length;
    const suspendedAccounts = accounts.filter(a => a.status === 'suspended').length;
    const overdueInvoices = invoices.filter(i => i.status === 'overdue').length;
    const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);

    res.json({
      total_clients: clients.length,
      total_accounts: accounts.length,
      active_accounts: activeAccounts,
      suspended_accounts: suspendedAccounts,
      overdue_invoices: overdueInvoices,
      total_revenue: totalPaid
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clients API
app.get('/api/clients', (req, res) => {
  try {
    const clients = HostingService.getAllClients();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', (req, res) => {
  try {
    const { name, email, phone, cpf_cnpj } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    }
    const client = HostingService.createClient({ name, email, phone, cpf_cnpj });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Hosting Plans API
app.get('/api/plans', (req, res) => {
  try {
    const plans = HostingService.getAllPlans();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hosting Accounts API
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = HostingService.getAllHostingAccounts();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const { client_id, plan_id, domain, username } = req.body;
    if (!client_id || !plan_id || !domain || !username) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    const account = HostingService.createHostingAccount({ client_id, plan_id, domain, username });
    res.status(201).json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/suspend', (req, res) => {
  try {
    const { reason } = req.body;
    const account = HostingService.suspendAccount(req.params.id, reason || 'Suspenso manualmente pelo administrador');
    res.json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/reactivate', (req, res) => {
  try {
    const account = HostingService.reactivateAccount(req.params.id);
    res.json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Invoices API
app.get('/api/invoices', (req, res) => {
  try {
    const invoices = HostingService.getAllInvoices();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', (req, res) => {
  try {
    const { hosting_account_id, amount, due_date } = req.body;
    if (!hosting_account_id || !amount || !due_date) {
      return res.status(400).json({ error: 'Dados incompletos para criação de fatura' });
    }
    const invoice = HostingService.createInvoice({ hosting_account_id, amount, due_date });
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Payment API (Payment Simulation / Webhook)
app.post('/api/payments/pay', (req, res) => {
  try {
    const { invoice_id, payment_method, transaction_id } = req.body;
    if (!invoice_id) {
      return res.status(400).json({ error: 'ID da fatura é obrigatório' });
    }
    const result = HostingService.processPayment({ invoice_id, payment_method, transaction_id });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cron / Automation endpoint (Checks 7-day overdue accounts)
app.post('/api/cron/check-suspensions', (req, res) => {
  try {
    const days = req.body.days !== undefined ? parseInt(req.body.days, 10) : 7;
    const result = HostingService.checkOverdueAndSuspendAccounts(days);
    res.json({
      success: true,
      message: `Verificação de atrasos concluída (${days} dias).`,
      result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Logs API
app.get('/api/logs', (req, res) => {
  try {
    const logs = HostingService.getLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
