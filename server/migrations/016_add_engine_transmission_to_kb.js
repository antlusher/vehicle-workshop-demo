exports.up = (pgm) => {
  pgm.addColumn('knowledge_base', {
    engine_id: { type: 'uuid', references: '"engines"', onDelete: 'SET NULL' },
    transmission_id: { type: 'uuid', references: '"transmissions"', onDelete: 'SET NULL' },
  });
  pgm.createIndex('knowledge_base', 'engine_id');
  pgm.createIndex('knowledge_base', 'transmission_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('knowledge_base', 'engine_id');
  pgm.dropColumn('knowledge_base', 'transmission_id');
};
