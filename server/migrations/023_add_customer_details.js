exports.up = (pgm) => {
  pgm.addColumns('users', {
    name:          { type: 'text' },
    phone:         { type: 'text' },
    address_line1: { type: 'text' },
    address_line2: { type: 'text' },
    city:          { type: 'text' },
    postcode:      { type: 'text' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('users', ['name', 'phone', 'address_line1', 'address_line2', 'city', 'postcode']);
};
