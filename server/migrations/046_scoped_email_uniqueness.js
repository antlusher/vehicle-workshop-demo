exports.up = async (pgm) => {
  // Drop the global unique constraint on email
  pgm.sql(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`);
  // Staff (non-customers) remain globally unique by email
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_staff_unique
    ON users (LOWER(email))
    WHERE role NOT IN ('customer')
  `);
  // Customers are unique per workshop — same email can be a customer at multiple workshops
  // and can also be a staff member elsewhere
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_customer_workshop_unique
    ON users (LOWER(email), workshop_id)
    WHERE role = 'customer'
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS users_email_staff_unique`);
  pgm.sql(`DROP INDEX IF EXISTS users_email_customer_workshop_unique`);
  pgm.sql(`ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)`);
};
