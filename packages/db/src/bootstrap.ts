import type Database from "better-sqlite3";

function ensureColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;

  if (columns.some((item) => item.name === column)) {
    return;
  }

  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export function bootstrapDb(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_email TEXT NOT NULL UNIQUE,
      contact_name TEXT NOT NULL,
      account_number TEXT NOT NULL UNIQUE,
      account_type TEXT NOT NULL DEFAULT 'client',
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      unit_price REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity_available INTEGER NOT NULL DEFAULT 0,
      quantity_reserved INTEGER NOT NULL DEFAULT 0,
      warehouse TEXT NOT NULL DEFAULT 'main',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      custom_price REAL,
      discount_pct REAL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      status TEXT NOT NULL DEFAULT 'active',
      must_reset_password INTEGER NOT NULL DEFAULT 0,
      feature_flags TEXT NOT NULL DEFAULT '[]',
      last_login_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      role TEXT NOT NULL DEFAULT 'customer',
      session_token TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'text',
      autonomy TEXT NOT NULL DEFAULT 'manual',
      user_agent TEXT,
      ip_address TEXT,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      revoke_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id),
      actor_role TEXT NOT NULL DEFAULT 'system',
      customer_id INTEGER REFERENCES customers(id),
      target_user_id INTEGER REFERENCES users(id),
      session_id INTEGER REFERENCES user_sessions(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      outcome TEXT NOT NULL DEFAULT 'success',
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      owner_user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL DEFAULT 'brief',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      current_version_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id),
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_markdown TEXT NOT NULL,
      content_html TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      file_path TEXT,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'customer',
      session_id INTEGER REFERENCES user_sessions(id),
      mode TEXT NOT NULL DEFAULT 'text',
      autonomy TEXT NOT NULL DEFAULT 'manual',
      sandbox TEXT NOT NULL DEFAULT 'app',
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      current_step_index INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_runs(id),
      step_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      action_key TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      requires_approval INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 2,
      last_error TEXT,
      checkpoint_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_runs(id),
      step_id INTEGER REFERENCES workflow_steps(id),
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_runs(id),
      step_id INTEGER REFERENCES workflow_steps(id),
      checkpoint_key TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_runs(id),
      step_id INTEGER REFERENCES workflow_steps(id),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      user_id INTEGER REFERENCES users(id),
      workflow_run_id INTEGER REFERENCES workflow_runs(id),
      scope TEXT NOT NULL DEFAULT 'tenant',
      namespace TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS connector_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      provider TEXT NOT NULL,
      account_identifier TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disconnected',
      scopes TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assistant_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'customer',
      mode TEXT NOT NULL DEFAULT 'text',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      source_page TEXT,
      linked_workflow_run_id INTEGER REFERENCES workflow_runs(id),
      linked_document_id INTEGER REFERENCES documents(id),
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assistant_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES assistant_sessions(id),
      role TEXT NOT NULL DEFAULT 'assistant',
      entry_type TEXT NOT NULL DEFAULT 'message',
      content TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendor_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      vendor_code TEXT NOT NULL UNIQUE,
      category_focus TEXT NOT NULL,
      payment_terms TEXT NOT NULL,
      lead_time_days INTEGER NOT NULL DEFAULT 14,
      reliability_score REAL NOT NULL DEFAULT 90,
      preferred_shipping_method TEXT,
      operations_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendor_catalog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_customer_id INTEGER NOT NULL REFERENCES customers(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      vendor_sku TEXT NOT NULL,
      unit_cost REAL NOT NULL,
      minimum_order_qty INTEGER NOT NULL DEFAULT 1,
      lead_time_days INTEGER NOT NULL DEFAULT 14,
      available_qty INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_customer_id INTEGER NOT NULL REFERENCES customers(id),
      issued_by_user_id INTEGER NOT NULL REFERENCES users(id),
      purchase_order_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      expected_ship_date TEXT,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendor_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      carrier TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      estimated_delivery TEXT,
      events TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendor_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      vendor_customer_id INTEGER NOT NULL REFERENCES customers(id),
      invoice_number TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT NOT NULL,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_caches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      user_id INTEGER REFERENCES users(id),
      session_id INTEGER REFERENCES assistant_sessions(id),
      role TEXT NOT NULL DEFAULT 'customer',
      source_mode TEXT NOT NULL DEFAULT 'text',
      normalized_prompt TEXT NOT NULL,
      prompt_label TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 1,
      last_response TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      order_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      invoice_number TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT NOT NULL,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      carrier TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      estimated_delivery TEXT,
      events TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS edi_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id),
      type TEXT NOT NULL,
      direction TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensureColumn(
    sqlite,
    "customers",
    "account_type",
    "account_type TEXT NOT NULL DEFAULT 'client'",
  );
  ensureColumn(
    sqlite,
    "users",
    "status",
    "status TEXT NOT NULL DEFAULT 'active'",
  );
  ensureColumn(
    sqlite,
    "users",
    "must_reset_password",
    "must_reset_password INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    sqlite,
    "users",
    "feature_flags",
    "feature_flags TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumn(sqlite, "users", "last_login_at", "last_login_at TEXT");
  ensureColumn(
    sqlite,
    "users",
    "updated_at",
    "updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
  );
}
