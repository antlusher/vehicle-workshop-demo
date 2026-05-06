exports.up = (pgm) => {
  pgm.addColumn('projects', {
    vehicle_id: { type: 'uuid', references: '"vehicles"', onDelete: 'SET NULL' },
    // Snapshot of the VRN at time the job was opened — never changes even if plate moves
    registration_snapshot: { type: 'varchar(20)' },
  });
  pgm.createIndex('projects', 'vehicle_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('projects', 'vehicle_id');
  pgm.dropColumn('projects', 'registration_snapshot');
};
