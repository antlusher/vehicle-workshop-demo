exports.up = (pgm) => {
  pgm.createTable('enquiries', {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    customer_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    workshop_id: { type: 'uuid', notNull: true, references: 'workshops(id)', onDelete: 'CASCADE' },
    vehicle_id:  { type: 'uuid', references: 'vehicles(id)', onDelete: 'SET NULL' },
    message:     { type: 'text', notNull: true },
    status:      { type: 'text', notNull: true, default: "'new'" },
    created_at:  { type: 'timestamptz', default: pgm.func('now()') },
  });
  pgm.createIndex('enquiries', 'workshop_id');
  pgm.createIndex('enquiries', 'customer_id');
};

exports.down = (pgm) => {
  pgm.dropTable('enquiries');
};
