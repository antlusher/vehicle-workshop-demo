exports.up = async (query) => {
  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS name          TEXT,
      ADD COLUMN IF NOT EXISTS phone         TEXT,
      ADD COLUMN IF NOT EXISTS address_line1 TEXT,
      ADD COLUMN IF NOT EXISTS address_line2 TEXT,
      ADD COLUMN IF NOT EXISTS city          TEXT,
      ADD COLUMN IF NOT EXISTS postcode      TEXT
  `);
};
