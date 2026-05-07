exports.up = (pgm) => {
  pgm.createTable('customer_vehicles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    customer_id: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'CASCADE' },
    vehicle_id: { type: 'uuid', notNull: true, references: '"vehicles"', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('customer_vehicles', 'customer_id');
  pgm.addConstraint('customer_vehicles', 'customer_vehicles_unique', 'UNIQUE (customer_id, vehicle_id)');
};

exports.down = (pgm) => {
  pgm.dropTable('customer_vehicles');
};
