const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '../reseller.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      cpf_cnpj TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      disk_space_mb INTEGER NOT NULL,
      bandwidth_gb INTEGER NOT NULL,
      max_domains INTEGER NOT NULL DEFAULT 1,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hosting_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'terminated'
      suspension_reason TEXT,
      suspended_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hosting_account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL, -- Format: YYYY-MM-DD
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'cancelled'
      paid_at DATETIME,
      payment_method TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hosting_account_id) REFERENCES hosting_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      transaction_id TEXT UNIQUE,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default plans if table is empty
  const planCount = db.prepare('SELECT COUNT(*) as count FROM plans').get().count;
  if (planCount === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO plans (name, price, disk_space_mb, bandwidth_gb, max_domains, billing_cycle)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertPlan.run('Plano Start', 29.90, 5000, 50, 1, 'monthly');
    insertPlan.run('Plano Pro', 59.90, 20000, 200, 5, 'monthly');
    insertPlan.run('Plano Business', 119.90, 50000, 500, 20, 'monthly');
  }
}

initDatabase();

module.exports = db;
