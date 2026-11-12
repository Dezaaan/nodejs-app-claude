import { createHash, randomBytes } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import { isRole } from "../../shared/auth/permissions.js";
import type { AuthContext } from "../../shared/http/authContext.js";

const ISSUER = "nodejs-app-claude";
const AUDIENCE = "nodejs-app-claude-api";

export type AccessTokens = {
  sign(auth: AuthContext): Promise<string>;

  // Returns null for any invalid, tampered or expired token.
  verify(token: string): Promise<AuthContext | null>;
};

type CreateAccessTokensOptions = {
  secret: string;
  ttlSeconds: number;
};

export const createAccessTokens = ({
  secret,
  ttlSeconds,
}: CreateAccessTokensOptions): AccessTokens => {
  const key = new TextEncoder().encode(secret);

  // The role is in the token so each request needs no database lookup. A role
  // change therefore takes effect at the next refresh, within the token TTL.
  const sign = ({ userId, role }: AuthContext): Promise<string> =>
    new SignJWT({ role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(key);

  const verify = async (token: string): Promise<AuthContext | null> => {
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ["HS256"],
      });

      // A token without a known role (for example, one issued before roles
      // existed) is rejected; the client refreshes and gets a new one.
      return payload.sub && isRole(payload.role)
        ? { userId: payload.sub, role: payload.role }
        : null;
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        return null;
      }

      throw error;
    }
  };

  return { sign, verify };
};

// Refresh tokens are random, not JWTs: the database is their source of truth.
export const generateRefreshToken = (): string =>
  randomBytes(32).toString("base64url");

export const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
