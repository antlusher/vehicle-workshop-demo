exports.up = (pgm) => {
  pgm.addColumn('projects', {
    vehicle_type_id: { type: 'uuid', references: '"vehicle_types"', onDelete: 'SET NULL' },
  });
  pgm.createIndex('projects', 'vehicle_type_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('projects', 'vehicle_type_id');
};
