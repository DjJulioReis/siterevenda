process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/database');
const HostingService = require('../src/hostingService');

describe('Revenda de Hospedagem - System Tests', () => {
  let clientId;
  let accountId;
  let planId = 1;

  beforeAll(() => {
    // Database initializes automatically in memory for tests
  });

  test('1. Must create a client successfully', async () => {
    const res = await request(app)
      .post('/api/clients')
      .send({
        name: 'João da Silva',
        email: 'joao@empresa.com.br',
        phone: '11999998888',
        cpf_cnpj: '123.456.789-00'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('João da Silva');
    clientId = res.body.id;
  });

  test('1b. Must reject client creation with invalid email format', async () => {
    const res = await request(app)
      .post('/api/clients')
      .send({
        name: 'Cliente Invalido',
        email: 'invalid-email-format',
        phone: '11999998888'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Formato de email inválido');
  });

  test('2. Must create hosting account and auto-generate initial invoice', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .send({
        client_id: clientId,
        plan_id: planId,
        domain: 'minhaempresa.com.br',
        username: 'minhaempresa'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.domain).toBe('minhaempresa.com.br');
    expect(res.body.status).toBe('active');
    accountId = res.body.id;

    // Verify invoice created
    const invoices = HostingService.getAllInvoices();
    const inv = invoices.find(i => i.hosting_account_id === accountId);
    expect(inv).toBeDefined();
    expect(inv.amount).toBe(29.90);
    expect(inv.status).toBe('pending');
  });

  test('3. Must NOT suspend account if invoice overdue is less than 7 days', async () => {
    // Modify invoice due_date to 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateStr = threeDaysAgo.toISOString().split('T')[0];

    db.prepare('UPDATE invoices SET due_date = ? WHERE hosting_account_id = ?').run(dateStr, accountId);

    const cronRes = HostingService.checkOverdueAndSuspendAccounts(7);
    expect(cronRes.suspended_accounts.length).toBe(0);

    const acc = HostingService.getHostingAccountById(accountId);
    expect(acc.status).toBe('active');
  });

  test('4. MUST SUSPEND account temporarily if overdue date is >= 7 days', async () => {
    // Modify invoice due_date to 10 days ago (more than 7 days)
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const dateStr = tenDaysAgo.toISOString().split('T')[0];

    db.prepare('UPDATE invoices SET due_date = ? WHERE hosting_account_id = ?').run(dateStr, accountId);

    const cronRes = HostingService.checkOverdueAndSuspendAccounts(7);
    expect(cronRes.suspended_accounts.length).toBe(1);
    expect(cronRes.suspended_accounts[0].id).toBe(accountId);

    const acc = HostingService.getHostingAccountById(accountId);
    expect(acc.status).toBe('suspended');
    expect(acc.suspension_reason).toContain('Bloqueio automático');
  });

  test('5. Must auto-reactivate account upon payment confirmation', async () => {
    const invoices = HostingService.getAllInvoices();
    const inv = invoices.find(i => i.hosting_account_id === accountId);

    const payRes = await request(app)
      .post('/api/payments/pay')
      .send({
        invoice_id: inv.id,
        payment_method: 'PIX'
      });

    expect(payRes.statusCode).toBe(200);
    expect(payRes.body.success).toBe(true);

    const acc = HostingService.getHostingAccountById(accountId);
    expect(acc.status).toBe('active');
    expect(acc.suspension_reason).toBeNull();
  });

  test('6. Must handle manual suspension and reactivation', async () => {
    // Manual suspend
    await request(app).post(`/api/accounts/${accountId}/suspend`).send({ reason: 'Manutenção solicitada' });
    let acc = HostingService.getHostingAccountById(accountId);
    expect(acc.status).toBe('suspended');

    // Manual reactivate
    await request(app).post(`/api/accounts/${accountId}/reactivate`).send();
    acc = HostingService.getHostingAccountById(accountId);
    expect(acc.status).toBe('active');
  });
});
