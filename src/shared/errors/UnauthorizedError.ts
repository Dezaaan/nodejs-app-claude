import { AppError } from "./AppError.js";

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super({
      statusCode: 401,
      code: "UNAUTHORIZED",
      message,
    });

    this.name = "UnauthorizedError";
  }
}
