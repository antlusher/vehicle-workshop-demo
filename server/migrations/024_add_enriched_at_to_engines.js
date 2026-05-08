exports.up = (pgm) => {
  pgm.addColumns('engines', {
    enriched_at: { type: 'timestamptz' },
    enriched_model: { type: 'text' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('engines', ['enriched_at', 'enriched_model']);
};
