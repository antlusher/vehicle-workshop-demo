exports.up = (pgm) => {
  pgm.addColumns('quotes', {
    quote_token: { type: 'varchar(64)', notNull: false },
    quote_token_expires_at: { type: 'timestamptz', notNull: false },
    quote_email: { type: 'text', notNull: false },
  });
  pgm.sql(`CREATE UNIQUE INDEX quotes_quote_token_unique ON quotes (quote_token) WHERE quote_token IS NOT NULL`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS quotes_quote_token_unique`);
  pgm.dropColumns('quotes', ['quote_token', 'quote_token_expires_at', 'quote_email']);
};
