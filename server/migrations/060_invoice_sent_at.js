exports.up = (pgm) => {
  pgm.addColumns('quotes', {
    invoice_sent_at: { type: 'timestamp' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('quotes', ['invoice_sent_at']);
};
