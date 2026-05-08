exports.up = (pgm) => {
  pgm.addColumns('vehicles', {
    mot_tests: { type: 'jsonb' },
    mot_fetched_at: { type: 'timestamptz' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('vehicles', ['mot_tests', 'mot_fetched_at']);
};
