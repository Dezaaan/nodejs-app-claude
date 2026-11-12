import type { Role } from "../../shared/auth/permissions.js";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
};

export type NewRefreshToken = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export type RefreshTokenOwner = {
  userId: string;
  familyId: string;
};

export type StoredRefreshToken = RefreshTokenOwner & {
  revokedAt: Date | null;
};

export type AuthSession = {
  user: User;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};
