exports.up = (pgm) => {
  pgm.createTable('vehicle_types', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    make: { type: 'varchar(100)', notNull: true },
    model: { type: 'varchar(100)', notNull: true },
    year_from: { type: 'varchar(10)' },
    year_to: { type: 'varchar(10)' },
    body_type: { type: 'varchar(100)' },
    fuel_type: { type: 'varchar(50)' },
    engine_id: { type: 'uuid', references: '"engines"', onDelete: 'SET NULL' },
    engine_code: { type: 'varchar(50)' },
    transmission_id: { type: 'uuid', references: '"transmissions"', onDelete: 'SET NULL' },
    transmission_code: { type: 'varchar(50)' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('vehicle_types', ['make', 'model']);
  pgm.createIndex('vehicle_types', 'engine_id');
  pgm.createIndex('vehicle_types', 'transmission_id');
};

exports.down = (pgm) => {
  pgm.dropTable('vehicle_types');
};
