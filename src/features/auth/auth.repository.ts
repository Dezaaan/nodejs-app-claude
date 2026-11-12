import type {
  NewRefreshToken,
  RefreshTokenOwner,
  StoredRefreshToken,
  User,
} from "./auth.types.js";

export type UsersRepository = {
  // Returns null when the email is already registered.
  create(user: User): Promise<User | null>;

  findByEmail(email: string): Promise<User | null>;

  findById(id: string): Promise<User | null>;
};

export type RefreshTokensRepository = {
  create(token: NewRefreshToken): Promise<void>;

  // Revokes the token if it is active and returns its owner. Returns null when
  // it is unknown, expired or already revoked. Being a single statement, only
  // one concurrent caller can consume a given token.
  consume(tokenHash: string, now: Date): Promise<RefreshTokenOwner | null>;

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  revokeFamily(familyId: string, now: Date): Promise<void>;
};
