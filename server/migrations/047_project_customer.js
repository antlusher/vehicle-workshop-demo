exports.up = (pgm) => {
  pgm.addColumns('projects', {
    customer_id: { type: 'uuid', notNull: false, references: '"users"', onDelete: 'SET NULL' },
  });
  pgm.createIndex('projects', 'customer_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('projects', ['customer_id']);
};
