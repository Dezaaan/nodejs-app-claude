import * as argon2 from "argon2";

export type PasswordHasher = {
  hash(password: string): Promise<string>;

  // Pass null when the user doesn't exist: it still does the same work and
  // returns false, so response times don't reveal which emails are registered.
  verify(passwordHash: string | null, password: string): Promise<boolean>;
};

export const createPasswordHasher = (): PasswordHasher => {
  let dummyHash: Promise<string> | undefined;

  const hash = (password: string): Promise<string> =>
    argon2.hash(password, { type: argon2.argon2id });

  const verify = async (
    passwordHash: string | null,
    password: string,
  ): Promise<boolean> => {
    if (passwordHash === null) {
      dummyHash ??= hash("dummy-password-for-constant-timing");

      await argon2.verify(await dummyHash, password);

      return false;
    }

    return argon2.verify(passwordHash, password);
  };

  return { hash, verify };
};
