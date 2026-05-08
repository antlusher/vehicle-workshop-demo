exports.up = (pgm) => {
  pgm.alterColumn('engines', 'displacement', { type: 'text' });
};

exports.down = (pgm) => {
  pgm.alterColumn('engines', 'displacement', { type: 'varchar(20)' });
};
