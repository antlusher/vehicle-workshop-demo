exports.up = (pgm) => {
  pgm.createTable('confirmed_suggestions', {
    id: 'id',
    project_id: {
      type: 'uuid',
      notNull: true,
      references: '"projects"',
      onDelete: 'CASCADE',
    },
    history_id: {
      type: 'uuid',
      references: '"project_history"',
      onDelete: 'SET NULL',
    },
    text: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('confirmed_suggestions');
};
