exports.up = (pgm) => {
  pgm.addColumn('vehicles', {
    vehicle_type_id: { type: 'uuid', references: '"vehicle_types"', onDelete: 'SET NULL' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Unique index on VIN where not null — one canonical record per physical car
  pgm.createIndex('vehicles', 'vin', { unique: true, where: 'vin IS NOT NULL' });
};

exports.down = (pgm) => {
  pgm.dropIndex('vehicles', 'vin', { unique: true, where: 'vin IS NOT NULL' });
  pgm.dropColumn('vehicles', 'vehicle_type_id');
  pgm.dropColumn('vehicles', 'updated_at');
};
