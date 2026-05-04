exports.up = (pgm) => {
  pgm.createTable('vehicles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    registration: { type: 'varchar(20)' },
    vin: { type: 'varchar(17)' },
    make: { type: 'varchar(100)' },
    model: { type: 'varchar(100)' },
    year: { type: 'varchar(10)' },
    engine_code: { type: 'varchar(100)' },
    fuel_type: { type: 'varchar(50)' },
    trim: { type: 'varchar(100)' },
    body_type: { type: 'varchar(100)' },
    source: { type: 'varchar(50)' },
    raw_data: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('vehicles', 'registration');
  pgm.createIndex('vehicles', 'vin');
};

exports.down = (pgm) => {
  pgm.dropTable('vehicles');
};
