exports.up = async (pgm) => {
  // Fix column default — previous migration used "'draft'" which stored literal quotes
  pgm.sql(`ALTER TABLE quotes ALTER COLUMN status SET DEFAULT 'draft'`);
  // Fix any existing rows that have the quoted value stored
  pgm.sql(`UPDATE quotes SET status = TRIM(BOTH '''' FROM status) WHERE status LIKE '''%'''`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE quotes ALTER COLUMN status SET DEFAULT '''draft'''`);
};
