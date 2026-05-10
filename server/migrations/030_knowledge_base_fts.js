exports.up = (pgm) => {
  pgm.addColumn('knowledge_base', {
    search_vector: { type: 'tsvector' },
  });

  pgm.sql(`
    UPDATE knowledge_base
    SET search_vector = to_tsvector('english',
      COALESCE(title, '') || ' ' ||
      COALESCE(make, '') || ' ' ||
      COALESCE(model, '') || ' ' ||
      COALESCE(fault_code, '') || ' ' ||
      COALESCE(content, '')
    )
  `);

  pgm.createIndex('knowledge_base', 'search_vector', { name: 'kb_search_vector_idx', method: 'gin' });

  pgm.sql(`
    CREATE OR REPLACE FUNCTION kb_search_vector_update() RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.title, '') || ' ' ||
        COALESCE(NEW.make, '') || ' ' ||
        COALESCE(NEW.model, '') || ' ' ||
        COALESCE(NEW.fault_code, '') || ' ' ||
        COALESCE(NEW.content, '')
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER kb_search_vector_trigger
      BEFORE INSERT OR UPDATE ON knowledge_base
      FOR EACH ROW EXECUTE FUNCTION kb_search_vector_update();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS kb_search_vector_trigger ON knowledge_base');
  pgm.sql('DROP FUNCTION IF EXISTS kb_search_vector_update');
  pgm.dropIndex('knowledge_base', 'search_vector', { name: 'kb_search_vector_idx' });
  pgm.dropColumn('knowledge_base', 'search_vector');
};
