exports.up = (pgm) => {
  pgm.createTable('quote_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    quote_id: { type: 'uuid', notNull: true, references: '"quotes"', onDelete: 'CASCADE' },
    title: { type: 'text', notNull: true },
    description: { type: 'text' },
    notes: { type: 'text' },
    sort_order: { type: 'integer', default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('quote_items', 'quote_id');

  pgm.addColumn('quote_lines', {
    quote_item_id: { type: 'uuid', references: '"quote_items"', onDelete: 'SET NULL' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('quote_lines', 'quote_item_id');
  pgm.dropTable('quote_items');
};
