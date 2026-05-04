exports.up = (pgm) => {
  pgm.createTable('confirmed_suggestions', {
    id: 'id',
    project_id: {
      type: 'integer',
      notNull: true,
      references: 'projects(id)',
      onDelete: 'CASCADE',
    },
    history_id: {
      type: 'integer',
      references: 'project_history(id)',
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
