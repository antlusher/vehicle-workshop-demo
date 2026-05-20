exports.up = (pgm) => {
  pgm.addColumns('workshop_settings', {
    invoice_logo_url:       { type: 'text' },
    invoice_accent_color:   { type: 'text', default: "'#1e40af'" },
    invoice_vat_number:     { type: 'text' },
    invoice_footer_text:    { type: 'text' },
    invoice_show_bank_details: { type: 'boolean', default: false },
    invoice_bank_name:      { type: 'text' },
    invoice_account_name:   { type: 'text' },
    invoice_account_number: { type: 'text' },
    invoice_sort_code:      { type: 'text' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('workshop_settings', [
    'invoice_logo_url', 'invoice_accent_color', 'invoice_vat_number',
    'invoice_footer_text', 'invoice_show_bank_details',
    'invoice_bank_name', 'invoice_account_name', 'invoice_account_number', 'invoice_sort_code',
  ]);
};
