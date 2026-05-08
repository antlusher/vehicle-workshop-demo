exports.up = (pgm) => {
  pgm.addColumns('projects', {
    archived_at: { type: 'timestamptz' },
  }, { ifNotExists: true });
  pgm.createIndex('projects', 'archived_at');
};

exports.down = (pgm) => {
  pgm.dropIndex('projects', 'archived_at');
  pgm.dropColumns('projects', ['archived_at']);
};
