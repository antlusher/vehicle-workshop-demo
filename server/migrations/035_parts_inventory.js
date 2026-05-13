exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE parts_catalogue ADD COLUMN IF NOT EXISTS stock_qty INTEGER NOT NULL DEFAULT 0`);
  pgm.sql(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT false`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE parts_catalogue DROP COLUMN IF EXISTS stock_qty`);
  pgm.sql(`ALTER TABLE quotes DROP COLUMN IF EXISTS stock_deducted`);
};
