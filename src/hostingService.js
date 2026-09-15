const db = require('./database');

class HostingService {
  // Client Methods
  static createClient({ name, email, phone, cpf_cnpj }) {
    // Security: Validate email format to prevent storing invalid data or exposing internal DB errors
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      throw new Error('Formato de email inválido');
    }

    const stmt = db.prepare(`
      INSERT INTO clients (name, email, phone, cpf_cnpj)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(name, email, phone || null, cpf_cnpj || null);
    return this.getClientById(info.lastInsertRowid);
  }

  static getClientById(id) {
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  }

  static getAllClients() {
    return db.prepare('SELECT * FROM clients ORDER BY id DESC').all();
  }

  // Plan Methods
  static getAllPlans() {
    return db.prepare('SELECT * FROM plans ORDER BY price ASC').all();
  }

  static getPlanById(id) {
    return db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  }

  // Hosting Account Methods
  static createHostingAccount({ client_id, plan_id, domain, username }) {
    const client = this.getClientById(client_id);
    if (!client) throw new Error('Cliente não encontrado');

    const plan = this.getPlanById(plan_id);
    if (!plan) throw new Error('Plano de hospedagem não encontrado');

    const stmt = db.prepare(`
      INSERT INTO hosting_accounts (client_id, plan_id, domain, username, status)
      VALUES (?, ?, ?, ?, 'active')
    `);
    const info = stmt.run(client_id, plan_id, domain, username);
    const accountId = info.lastInsertRowid;

    // Log action
    this.logAction('ACCOUNT_CREATED', `Conta de hospedagem ${domain} (ID: ${accountId}) criada para o cliente ${client.name}.`);

    // Generate first invoice due in 7 days
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    this.createInvoice({
      hosting_account_id: accountId,
      amount: plan.price,
      due_date: dueDateStr
    });

    return this.getHostingAccountById(accountId);
  }

  static getHostingAccountById(id) {
    return db.prepare(`
      SELECT ha.*, c.name as client_name, c.email as client_email, p.name as plan_name, p.price as plan_price
      FROM hosting_accounts ha
      JOIN clients c ON ha.client_id = c.id
      JOIN plans p ON ha.plan_id = p.id
      WHERE ha.id = ?
    `).get(id);
  }

  static getAllHostingAccounts() {
    return db.prepare(`
      SELECT ha.*, c.name as client_name, c.email as client_email, p.name as plan_name, p.price as plan_price
      FROM hosting_accounts ha
      JOIN clients c ON ha.client_id = c.id
      JOIN plans p ON ha.plan_id = p.id
      ORDER BY ha.id DESC
    `).all();
  }

  static suspendAccount(hostingAccountId, reason = 'Atraso no pagamento') {
    const account = this.getHostingAccountById(hostingAccountId);
    if (!account) throw new Error('Conta não encontrada');

    if (account.status === 'suspended') return account;

    const stmt = db.prepare(`
      UPDATE hosting_accounts
      SET status = 'suspended', suspension_reason = ?, suspended_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(reason, hostingAccountId);

    this.logAction('ACCOUNT_SUSPENDED', `Conta ${account.domain} (ID: ${hostingAccountId}) foi SUSPENSA. Motivo: ${reason}`);
    return this.getHostingAccountById(hostingAccountId);
  }

  static reactivateAccount(hostingAccountId) {
    const account = this.getHostingAccountById(hostingAccountId);
    if (!account) throw new Error('Conta não encontrada');

    const stmt = db.prepare(`
      UPDATE hosting_accounts
      SET status = 'active', suspension_reason = NULL, suspended_at = NULL
      WHERE id = ?
    `);
    stmt.run(hostingAccountId);

    this.logAction('ACCOUNT_REACTIVATED', `Conta ${account.domain} (ID: ${hostingAccountId}) foi REATIVADA.`);
    return this.getHostingAccountById(hostingAccountId);
  }

  // Invoice Methods
  static createInvoice({ hosting_account_id, amount, due_date }) {
    const stmt = db.prepare(`
      INSERT INTO invoices (hosting_account_id, amount, due_date, status)
      VALUES (?, ?, ?, 'pending')
    `);
    const info = stmt.run(hosting_account_id, amount, due_date);
    return this.getInvoiceById(info.lastInsertRowid);
  }

  static getInvoiceById(id) {
    return db.prepare(`
      SELECT i.*, ha.domain, ha.client_id, c.name as client_name, c.email as client_email
      FROM invoices i
      JOIN hosting_accounts ha ON i.hosting_account_id = ha.id
      JOIN clients c ON ha.client_id = c.id
      WHERE i.id = ?
    `).get(id);
  }

  static getAllInvoices() {
    return db.prepare(`
      SELECT i.*, ha.domain, c.name as client_name
      FROM invoices i
      JOIN hosting_accounts ha ON i.hosting_account_id = ha.id
      JOIN clients c ON ha.client_id = c.id
      ORDER BY i.id DESC
    `).all();
  }

  // Payment Processing & Webhook Simulation
  static processPayment({ invoice_id, payment_method, transaction_id }) {
    const invoice = this.getInvoiceById(invoice_id);
    if (!invoice) throw new Error('Fatura não encontrada');

    if (invoice.status === 'paid') {
      return { success: true, message: 'Fatura já estava paga', invoice };
    }

    const txId = transaction_id || `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const payStmt = db.prepare(`
      INSERT INTO payments (invoice_id, transaction_id, amount, payment_method, status)
      VALUES (?, ?, ?, ?, 'completed')
    `);
    payStmt.run(invoice_id, txId, invoice.amount, payment_method || 'PIX');

    const invStmt = db.prepare(`
      UPDATE invoices
      SET status = 'paid', paid_at = CURRENT_TIMESTAMP, payment_method = ?
      WHERE id = ?
    `);
    invStmt.run(payment_method || 'PIX', invoice_id);

    this.logAction('PAYMENT_RECEIVED', `Pagamento de R$ ${invoice.amount} recebido para Fatura #${invoice_id} (${invoice.domain}). ID Transação: ${txId}`);

    // If account was suspended due to unpaid invoices, check if all overdue invoices are now paid
    const account = this.getHostingAccountById(invoice.hosting_account_id);
    if (account && account.status === 'suspended') {
      const overdueInvoices = db.prepare(`
        SELECT COUNT(*) as count FROM invoices
        WHERE hosting_account_id = ? AND status IN ('pending', 'overdue') AND id != ?
      `).get(invoice.hosting_account_id, invoice_id);

      if (overdueInvoices.count === 0) {
        this.reactivateAccount(account.id);
      }
    }

    return {
      success: true,
      message: 'Pagamento processado com sucesso',
      invoice: this.getInvoiceById(invoice_id)
    };
  }

  // Automated Overdue Check (Cortar temporariamente se tiver 7 dias ou mais de atraso)
  static checkOverdueAndSuspendAccounts(daysThreshold = 7) {
    // Security: Validate parameter to prevent NaN calculations and RangeError exceptions
    const days = Number(daysThreshold);
    if (isNaN(days) || days < 0) {
      throw new Error('Parâmetro de dias deve ser um número válido e não negativo');
    }

    // Calculate reference date (today minus daysThreshold days)
    const refDate = new Date();
    refDate.setDate(refDate.getDate() - days);
    const refDateStr = refDate.toISOString().split('T')[0];

    // Find all invoices that are pending or overdue, with due_date <= refDateStr
    const overdueInvoices = db.prepare(`
      SELECT i.*, ha.id as account_id, ha.domain, ha.status as account_status
      FROM invoices i
      JOIN hosting_accounts ha ON i.hosting_account_id = ha.id
      WHERE (i.status = 'pending' OR i.status = 'overdue')
        AND i.due_date <= ?
    `).all(refDateStr);

    const suspendedAccounts = [];

    for (const inv of overdueInvoices) {
      // Mark invoice as overdue
      db.prepare("UPDATE invoices SET status = 'overdue' WHERE id = ?").run(inv.id);

      // Calculate exact days overdue
      const dueDate = new Date(inv.due_date);
      const today = new Date();
      const diffTime = Math.abs(today - dueDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (inv.account_status !== 'suspended') {
        const updatedAcc = this.suspendAccount(
          inv.account_id,
          `Bloqueio automático: Fatura #${inv.id} com atraso de ${diffDays} dias (vencida em ${inv.due_date})`
        );
        suspendedAccounts.push(updatedAcc);
      }
    }

    return {
      checked_at: new Date().toISOString(),
      overdue_invoices_count: overdueInvoices.length,
      suspended_accounts: suspendedAccounts
    };
  }

  // System Logs
  static logAction(action, details) {
    db.prepare('INSERT INTO system_logs (action, details) VALUES (?, ?)').run(action, details);
  }

  static getLogs() {
    return db.prepare('SELECT * FROM system_logs ORDER BY id DESC LIMIT 100').all();
  }
}

module.exports = HostingService;
