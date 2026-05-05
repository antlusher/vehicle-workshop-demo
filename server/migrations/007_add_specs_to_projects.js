exports.up = (pgm) => {
  pgm.addColumn('projects', {
    specs: { type: 'jsonb', default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('projects', 'specs');
};
