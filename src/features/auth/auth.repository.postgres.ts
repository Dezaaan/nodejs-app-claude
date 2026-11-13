import type { Database } from "../../infrastructure/database/database.types.js";
import type {
  RefreshTokensRepository,
  UsersRepository,
} from "./auth.repository.js";
import type { User } from "./auth.types.js";
import { isRole } from "../../shared/auth/permissions.js";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
};

const mapUserRowToDomain = (row: UserRow): User => {
  // The database check constraint and this list must agree.
  if (!isRole(row.role)) {
    throw new Error(`Unknown role "${row.role}" for user ${row.id}`);
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const USER_COLUMNS = "id, email, password_hash, role, created_at, updated_at";

type Dependencies = {
  database: Database;
};

export const createPostgresUsersRepository = ({
  database,
}: Dependencies): UsersRepository => {
  const create = async (user: User): Promise<User | null> => {
    const result = await database.query<UserRow>(
      `
        INSERT INTO users (${USER_COLUMNS})
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (email) DO NOTHING
        RETURNING ${USER_COLUMNS}
      `,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.role,
        user.createdAt,
        user.updatedAt,
      ],
    );

    const row = result.rows[0];

    return row ? mapUserRowToDomain(row) : null;
  };

  const findByEmail = async (email: string): Promise<User | null> => {
    const result = await database.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`,
      [email],
    );

    const row = result.rows[0];

    return row ? mapUserRowToDomain(row) : null;
  };

  const findById = async (id: string): Promise<User | null> => {
    const result = await database.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );

    const row = result.rows[0];

    return row ? mapUserRowToDomain(row) : null;
  };

  const updateRole: UsersRepository["updateRole"] = async (
    email,
    role,
    now,
  ) => {
    const result = await database.query<UserRow>(
      `
        UPDATE users
        SET role = $2, updated_at = $3
        WHERE email = $1
        RETURNING ${USER_COLUMNS}
      `,
      [email, role, now],
    );

    const row = result.rows[0];

    return row ? mapUserRowToDomain(row) : null;
  };

  return {
    create,
    findByEmail,
    findById,
    updateRole,
  };
};

export const createPostgresRefreshTokensRepository = ({
  database,
}: Dependencies): RefreshTokensRepository => {
  const create: RefreshTokensRepository["create"] = async (token) => {
    await database.query(
      `
        INSERT INTO refresh_tokens (
          id, user_id, family_id, token_hash, expires_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        token.id,
        token.userId,
        token.familyId,
        token.tokenHash,
        token.expiresAt,
        token.createdAt,
      ],
    );
  };

  const consume: RefreshTokensRepository["consume"] = async (
    tokenHash,
    now,
  ) => {
    const result = await database.query<{
      user_id: string;
      family_id: string;
    }>(
      `
        UPDATE refresh_tokens
        SET revoked_at = $2
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > $2
        RETURNING user_id, family_id
      `,
      [tokenHash, now],
    );

    const row = result.rows[0];

    return row ? { userId: row.user_id, familyId: row.family_id } : null;
  };

  const findByHash: RefreshTokensRepository["findByHash"] = async (
    tokenHash,
  ) => {
    const result = await database.query<{
      user_id: string;
      family_id: string;
      revoked_at: Date | null;
    }>(
      `
        SELECT user_id, family_id, revoked_at
        FROM refresh_tokens
        WHERE token_hash = $1
      `,
      [tokenHash],
    );

    const row = result.rows[0];

    return row
      ? {
          userId: row.user_id,
          familyId: row.family_id,
          revokedAt: row.revoked_at,
        }
      : null;
  };

  const revokeFamily: RefreshTokensRepository["revokeFamily"] = async (
    familyId,
    now,
  ) => {
    await database.query(
      `
        UPDATE refresh_tokens
        SET revoked_at = $2
        WHERE family_id = $1
          AND revoked_at IS NULL
      `,
      [familyId, now],
    );
  };

  const deleteExpired: RefreshTokensRepository["deleteExpired"] = async (
    now,
  ) => {
    const result = await database.query(
      "DELETE FROM refresh_tokens WHERE expires_at < $1",
      [now],
    );

    return result.rowCount ?? 0;
  };

  return {
    consume,
    create,
    deleteExpired,
    findByHash,
    revokeFamily,
  };
};
