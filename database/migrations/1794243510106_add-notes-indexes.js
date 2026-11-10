export const up = (pgm) => {
  // Sort columns, with id to match the pagination tiebreaker.
  pgm.createIndex("notes", ["created_at", "id"]);
  pgm.createIndex("notes", ["updated_at", "id"]);
  pgm.createIndex("notes", ["title", "id"]);

  // Trigram indexes make ILIKE '%term%' searches indexable.
  pgm.createExtension("pg_trgm", { ifNotExists: true });
  pgm.createIndex("notes", [{ name: "title", opclass: "gin_trgm_ops" }], {
    method: "gin",
    name: "notes_title_trgm_index",
  });
  pgm.createIndex("notes", [{ name: "content", opclass: "gin_trgm_ops" }], {
    method: "gin",
    name: "notes_content_trgm_index",
  });
};

export const down = (pgm) => {
  pgm.dropIndex("notes", "content", { name: "notes_content_trgm_index" });
  pgm.dropIndex("notes", "title", { name: "notes_title_trgm_index" });
  pgm.dropExtension("pg_trgm", { ifExists: true });

  pgm.dropIndex("notes", ["title", "id"]);
  pgm.dropIndex("notes", ["updated_at", "id"]);
  pgm.dropIndex("notes", ["created_at", "id"]);
};
