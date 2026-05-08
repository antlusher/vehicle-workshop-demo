exports.up = (pgm) => {
  pgm.createTable('workshop_settings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    default_markup_pct: { type: 'numeric(5,2)', notNull: true, default: 30 },
    labour_rate_per_hour: { type: 'numeric(8,2)', notNull: true, default: 75 },
    vat_rate: { type: 'numeric(5,2)', notNull: true, default: 20 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('parts_catalogue', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    part_number: { type: 'text' },
    brand: { type: 'text' },
    title: { type: 'text', notNull: true },
    category: { type: 'text' },
    compatible_makes: { type: 'text[]' },
    compatible_models: { type: 'text[]' },
    compatible_engine_codes: { type: 'text[]' },
    cost_price: { type: 'numeric(10,2)' },
    list_price: { type: 'numeric(10,2)' },
    source: { type: 'text', default: "'seeded'" },
    source_ref: { type: 'text' },
    url: { type: 'text' },
    in_stock: { type: 'boolean', default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('parts_catalogue', 'category');
  pgm.createIndex('parts_catalogue', 'compatible_engine_codes', { method: 'gin' });
  pgm.createIndex('parts_catalogue', 'compatible_makes', { method: 'gin' });

  pgm.createTable('quotes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: '"projects"', onDelete: 'CASCADE' },
    status: { type: 'text', notNull: true, default: "'draft'" },
    notes: { type: 'text' },
    diagnostic_summary: { type: 'text' },
    vat_rate: { type: 'numeric(5,2)', notNull: true, default: 20 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('quotes', 'project_id');

  pgm.createTable('quote_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    quote_id: { type: 'uuid', notNull: true, references: '"quotes"', onDelete: 'CASCADE' },
    type: { type: 'text', notNull: true, default: "'part'" },
    description: { type: 'text', notNull: true },
    qty: { type: 'numeric(8,2)', notNull: true, default: 1 },
    unit_cost: { type: 'numeric(10,2)', notNull: true },
    markup_pct: { type: 'numeric(5,2)', notNull: true, default: 30 },
    part_id: { type: 'uuid', references: '"parts_catalogue"', onDelete: 'SET NULL' },
    part_number: { type: 'text' },
    sort_order: { type: 'integer', default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('quote_lines', 'quote_id');
};

exports.down = (pgm) => {
  pgm.dropTable('quote_lines');
  pgm.dropTable('quotes');
  pgm.dropTable('parts_catalogue');
  pgm.dropTable('workshop_settings');
};
