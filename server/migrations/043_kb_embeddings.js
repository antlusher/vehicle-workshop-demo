exports.up = async (pgm) => {
  // Enable pgvector — safe to call even if already enabled
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector');

  // 1536 dims = text-embedding-3-small (OpenAI), compatible with ada-002
  pgm.addColumns('knowledge_base', {
    embedding: { type: 'vector(1536)', notNull: false },
  });

  // HNSW index — works on empty tables, fast approximate nearest-neighbour
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
};
