exports.up = (pgm) => {
  pgm.addColumns('workshop_settings', {
    invoice_company_reg:  { type: 'text' },
    invoice_payment_terms: { type: 'text' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('workshop_settings', ['invoice_company_reg', 'invoice_payment_terms']);
};
