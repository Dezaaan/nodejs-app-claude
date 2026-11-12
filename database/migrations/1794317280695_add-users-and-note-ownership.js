export const up = (pgm) => {
  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true },
    // Stored lowercased by the app, so uniqueness is case-insensitive.
    email: { type: "varchar(254)", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  pgm.createTable("refresh_tokens", {
    id: { type: "uuid", primaryKey: true },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    // All tokens rotated from one login share a family, so a reused token can
    // revoke the whole session.
    family_id: { type: "uuid", notNull: true },
    // SHA-256 of the token; the raw token is never stored.
    token_hash: { type: "char(64)", notNull: true, unique: true },
    expires_at: { type: "timestamptz", notNull: true },
    revoked_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true },
  });

  pgm.createIndex("refresh_tokens", "user_id");
  pgm.createIndex("refresh_tokens", "family_id");

  // Existing notes have no owner. They are local test data, so they are
  // removed rather than assigned to a made-up user.
  pgm.sql("DELETE FROM notes");

  pgm.addColumn("notes", {
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
  });

  // Every notes query now filters by user first.
  pgm.dropIndex("notes", ["created_at", "id"]);
  pgm.dropIndex("notes", ["updated_at", "id"]);
  pgm.dropIndex("notes", ["title", "id"]);

  pgm.createIndex("notes", ["user_id", "created_at", "id"]);
  pgm.createIndex("notes", ["user_id", "updated_at", "id"]);
  pgm.createIndex("notes", ["user_id", "title", "id"]);
};

// Notes deleted by up() cannot be restored.
export const down = (pgm) => {
  pgm.dropIndex("notes", ["user_id", "title", "id"]);
  pgm.dropIndex("notes", ["user_id", "updated_at", "id"]);
  pgm.dropIndex("notes", ["user_id", "created_at", "id"]);

  pgm.createIndex("notes", ["created_at", "id"]);
  pgm.createIndex("notes", ["updated_at", "id"]);
  pgm.createIndex("notes", ["title", "id"]);

  pgm.dropColumn("notes", "user_id");
  pgm.dropTable("refresh_tokens");
  pgm.dropTable("users");
};
