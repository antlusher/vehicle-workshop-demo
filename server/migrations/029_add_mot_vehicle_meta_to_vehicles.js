exports.up = (pgm) => {
  pgm.addColumns('vehicles', {
    mot_vehicle_meta: { type: 'jsonb' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('vehicles', ['mot_vehicle_meta']);
};
