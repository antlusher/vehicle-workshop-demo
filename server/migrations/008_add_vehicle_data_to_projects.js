exports.up = (pgm) => {
  pgm.addColumn('projects', {
    vehicle_data: { type: 'jsonb', default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('projects', 'vehicle_data');
};
