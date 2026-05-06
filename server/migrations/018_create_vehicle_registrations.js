exports.up = (pgm) => {
  pgm.createTable('vehicle_registrations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    vehicle_id: { type: 'uuid', notNull: true, references: '"vehicles"', onDelete: 'CASCADE' },
    registration: { type: 'varchar(20)', notNull: true },
    assigned_from: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    assigned_to: { type: 'timestamptz' }, // null = currently assigned
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('vehicle_registrations', 'vehicle_id');
  pgm.createIndex('vehicle_registrations', 'registration');
  // Only one active (null assigned_to) registration per vehicle at a time
  pgm.createIndex('vehicle_registrations', ['vehicle_id'], {
    unique: true,
    where: 'assigned_to IS NULL',
    name: 'vehicle_registrations_current_unique',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('vehicle_registrations');
};
