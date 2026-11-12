// Roles decide what a user may do; the app maps each role to permissions.
// Existing users keep full access to their notes.
export const up = (pgm) => {
  pgm.addColumn("users", {
    role: {
      type: "varchar(20)",
      notNull: true,
      default: "user",
      check: "role IN ('user', 'viewer')",
    },
  });
};

export const down = (pgm) => {
  pgm.dropColumn("users", "role");
};
