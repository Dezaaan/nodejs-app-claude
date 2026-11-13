// Lets the hourly cleanup find expired refresh tokens without scanning the
// whole table.
export const up = (pgm) => {
  pgm.createIndex("refresh_tokens", "expires_at");
};

export const down = (pgm) => {
  pgm.dropIndex("refresh_tokens", "expires_at");
};
