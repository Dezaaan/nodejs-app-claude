import { randomUUID } from "node:crypto";
import type { Logger } from "../../infrastructure/createLogger.js";
import { ConflictError } from "../../shared/errors/ConflictError.js";
import { UnauthorizedError } from "../../shared/errors/UnauthorizedError.js";
import type { AuthContext } from "../../shared/http/authContext.js";
import type { PasswordHasher } from "./auth.passwords.js";
import type {
  RefreshTokensRepository,
  UsersRepository,
} from "./auth.repository.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  type AccessTokens,
} from "./auth.tokens.js";
import type { AuthSession, User } from "./auth.types.js";

const DAY_MS = 86_400_000;

export type AuthService = {
  register(input: RegisterInput): Promise<AuthSession>;

  login(input: LoginInput): Promise<AuthSession>;

  // Rotates the refresh token: the old one is revoked, a new one is issued.
  refresh(refreshToken: string | undefined): Promise<AuthSession>;

  logout(refreshToken: string | undefined): Promise<void>;

  authenticate(accessToken: string): Promise<AuthContext>;

  getCurrentUser(userId: string): Promise<User>;
};

type CreateAuthServiceDependencies = {
  usersRepository: UsersRepository;
  refreshTokensRepository: RefreshTokensRepository;
  passwordHasher: PasswordHasher;
  accessTokens: AccessTokens;
  refreshTokenTtlDays: number;
  logger: Logger;
};

export const createAuthService = ({
  usersRepository,
  refreshTokensRepository,
  passwordHasher,
  accessTokens,
  refreshTokenTtlDays,
  logger,
}: CreateAuthServiceDependencies): AuthService => {
  // A family groups every token rotated from one login, i.e. one session.
  const issueSession = async (
    user: User,
    familyId: string = randomUUID(),
  ): Promise<AuthSession> => {
    const now = new Date();
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + refreshTokenTtlDays * DAY_MS,
    );

    await refreshTokensRepository.create({
      id: randomUUID(),
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      createdAt: now,
    });

    return {
      user,
      accessToken: await accessTokens.sign(user.id),
      refreshToken,
      refreshTokenExpiresAt,
    };
  };

  const register = async (input: RegisterInput): Promise<AuthSession> => {
    const now = new Date();

    const user = await usersRepository.create({
      id: randomUUID(),
      email: input.email,
      passwordHash: await passwordHasher.hash(input.password),
      createdAt: now,
      updatedAt: now,
    });

    if (!user) {
      throw new ConflictError("Email is already registered");
    }

    logger.info("User registered", { userId: user.id });

    return issueSession(user);
  };

  const login = async (input: LoginInput): Promise<AuthSession> => {
    const user = await usersRepository.findByEmail(input.email);

    const isPasswordValid = await passwordHasher.verify(
      user?.passwordHash ?? null,
      input.password,
    );

    if (!user || !isPasswordValid) {
      logger.warn("Login failed");

      // Same message for both cases, so it doesn't reveal registered emails.
      throw new UnauthorizedError("Invalid email or password");
    }

    logger.info("User logged in", { userId: user.id });

    return issueSession(user);
  };

  const refresh = async (
    refreshToken: string | undefined,
  ): Promise<AuthSession> => {
    if (!refreshToken) {
      throw new UnauthorizedError("Refresh token is missing");
    }

    const now = new Date();
    const tokenHash = hashRefreshToken(refreshToken);
    const owner = await refreshTokensRepository.consume(tokenHash, now);

    if (!owner) {
      const storedToken = await refreshTokensRepository.findByHash(tokenHash);

      // A revoked token being used again means it was copied: whoever used it
      // first may be an attacker, so end the whole session for both parties.
      if (storedToken?.revokedAt) {
        await refreshTokensRepository.revokeFamily(storedToken.familyId, now);

        logger.warn("Refresh token reuse detected, session revoked", {
          userId: storedToken.userId,
        });
      }

      throw new UnauthorizedError("Refresh token is invalid or expired");
    }

    const user = await usersRepository.findById(owner.userId);

    if (!user) {
      throw new UnauthorizedError("Refresh token is invalid or expired");
    }

    return issueSession(user, owner.familyId);
  };

  const logout = async (refreshToken: string | undefined): Promise<void> => {
    if (!refreshToken) {
      return;
    }

    const storedToken = await refreshTokensRepository.findByHash(
      hashRefreshToken(refreshToken),
    );

    if (storedToken) {
      await refreshTokensRepository.revokeFamily(
        storedToken.familyId,
        new Date(),
      );

      logger.info("User logged out", { userId: storedToken.userId });
    }
  };

  const authenticate = async (accessToken: string): Promise<AuthContext> => {
    const auth = await accessTokens.verify(accessToken);

    if (!auth) {
      throw new UnauthorizedError("Access token is invalid or expired");
    }

    return auth;
  };

  const getCurrentUser = async (userId: string): Promise<User> => {
    const user = await usersRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedError();
    }

    return user;
  };

  return {
    authenticate,
    getCurrentUser,
    login,
    logout,
    refresh,
    register,
  };
};
