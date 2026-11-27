// Search always filters by user, but the trigram indexes covered every
// user's notes: for a common word PostgreSQL found matches across the whole
// table and then threw away other users' rows. These indexes lead with
// user_id, so a search only reads the searching user's entries.
//
// Built CONCURRENTLY so notes stay writable while the indexes build (minutes
// on a large table), which can't run inside a transaction.
export const up = (pgm) => {
  pgm.noTransaction();

  // Lets a GIN index hold user_id (a plain equality column) next to trigrams.
  pgm.createExtension("btree_gin", { ifNotExists: true });

  pgm.createIndex(
    "notes",
    ["user_id", { name: "title", opclass: "gin_trgm_ops" }],
    {
      method: "gin",
      name: "notes_user_id_title_trgm_index",
      concurrently: true,
      ifNotExists: true,
    },
  );
  pgm.createIndex(
    "notes",
    ["user_id", { name: "content", opclass: "gin_trgm_ops" }],
    {
      method: "gin",
      name: "notes_user_id_content_trgm_index",
      concurrently: true,
      ifNotExists: true,
    },
  );

  pgm.dropIndex("notes", "title", {
    name: "notes_title_trgm_index",
    concurrently: true,
    ifExists: true,
  });
  pgm.dropIndex("notes", "content", {
    name: "notes_content_trgm_index",
    concurrently: true,
    ifExists: true,
  });
};

export const down = (pgm) => {
  pgm.noTransaction();

  pgm.createIndex("notes", [{ name: "title", opclass: "gin_trgm_ops" }], {
    method: "gin",
    name: "notes_title_trgm_index",
    concurrently: true,
    ifNotExists: true,
  });
  pgm.createIndex("notes", [{ name: "content", opclass: "gin_trgm_ops" }], {
    method: "gin",
    name: "notes_content_trgm_index",
    concurrently: true,
    ifNotExists: true,
  });

  pgm.dropIndex("notes", "content", {
    name: "notes_user_id_content_trgm_index",
    concurrently: true,
    ifExists: true,
  });
  pgm.dropIndex("notes", "title", {
    name: "notes_user_id_title_trgm_index",
    concurrently: true,
    ifExists: true,
  });

  pgm.dropExtension("btree_gin", { ifExists: true });
};
