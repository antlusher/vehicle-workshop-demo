exports.up = (pgm) => {
  pgm.addColumns('ai_requests', {
    chat_mode: { type: 'varchar(20)', notNull: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('ai_requests', ['chat_mode']);
};
