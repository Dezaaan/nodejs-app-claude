import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPostgresRefreshTokensRepository,
  createPostgresUsersRepository,
} from "../../features/auth/auth.repository.postgres.js";
import { createTestDatabase } from "../helpers/createTestDatabase.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

const database = createTestDatabase();
const usersRepository = createPostgresUsersRepository({ database });
const refreshTokensRepository = createPostgresRefreshTokensRepository({
  database,
});

const DAY = 86_400_000;
const now = new Date("2026-11-13T12:00:00.000Z");
const daysFromNow = (days: number) => new Date(now.getTime() + days * DAY);

describe("PostgresRefreshTokensRepository.deleteExpired", () => {
  let userId: string;

  const createToken = async (expiresAt: Date, { revoked = false } = {}) => {
    const tokenHash = randomUUID().replaceAll("-", "").padEnd(64, "0");

    await refreshTokensRepository.create({
      id: randomUUID(),
      userId,
      familyId: randomUUID(),
      tokenHash,
      expiresAt,
      createdAt: daysFromNow(-30),
    });

    if (revoked) {
      await refreshTokensRepository.consume(tokenHash, daysFromNow(-31));
    }

    return tokenHash;
  };

  beforeEach(async () => {
    await resetDatabase(database);

    const user = await usersRepository.create({
      id: randomUUID(),
      email: `user-${randomUUID()}@example.com`,
      passwordHash: "not-a-real-hash",
      role: "user",
      createdAt: now,
      updatedAt: now,
    });

    userId = user!.id;
  });

  afterAll(async () => {
    await database.close();
  });

  it("deletes expired tokens, whether used or not", async () => {
    const expired = await createToken(daysFromNow(-1));
    const expiredAndRevoked = await createToken(daysFromNow(-2), {
      revoked: true,
    });

    await expect(refreshTokensRepository.deleteExpired(now)).resolves.toBe(2);

    await expect(
      refreshTokensRepository.findByHash(expired),
    ).resolves.toBeNull();
    await expect(
      refreshTokensRepository.findByHash(expiredAndRevoked),
    ).resolves.toBeNull();
  });

  it("keeps tokens that haven't expired, including revoked ones", async () => {
    const active = await createToken(daysFromNow(10));
    const revoked = await createToken(daysFromNow(10), { revoked: true });

    await expect(refreshTokensRepository.deleteExpired(now)).resolves.toBe(0);

    await expect(
      refreshTokensRepository.findByHash(active),
    ).resolves.toMatchObject({ revokedAt: null });
    await expect(
      refreshTokensRepository.findByHash(revoked),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
  });
});
