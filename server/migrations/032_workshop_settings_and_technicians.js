exports.up = (pgm) => {
  pgm.addColumns('workshop_settings', {
    workshop_name: { type: 'text' },
    address_line1: { type: 'text' },
    address_line2: { type: 'text' },
    city: { type: 'text' },
    postcode: { type: 'text' },
    phone: { type: 'text' },
    email: { type: 'text' },
    payment_notes: { type: 'text' },
  });

  pgm.createTable('technicians', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    role: { type: 'text' },
    email: { type: 'text' },
    phone: { type: 'text' },
    hourly_rate: { type: 'numeric(8,2)' },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('technicians');
  pgm.dropColumns('workshop_settings', ['workshop_name', 'address_line1', 'address_line2', 'city', 'postcode', 'phone', 'email', 'payment_notes']);
};
