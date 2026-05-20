exports.up = async (pgm) => {
  // Switch from OpenAI 1536-dim to local MiniLM 384-dim embeddings
  // Drop old column (no data yet) and recreate at correct dimensions
  pgm.sql('DROP INDEX IF EXISTS knowledge_base_embedding_idx');
  pgm.dropColumns('knowledge_base', ['embedding']);
  pgm.addColumns('knowledge_base', {
    embedding: { type: 'vector(384)', notNull: false },
  });
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
    ON knowledge_base
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS knowledge_base_embedding_idx');
  pgm.dropColumns('knowledge_base', ['embedding']);
  pgm.addColumns('knowledge_base', {
    embedding: { type: 'vector(1536)', notNull: false },
  });
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
    ON knowledge_base
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
};
