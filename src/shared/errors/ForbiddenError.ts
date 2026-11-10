import { AppError } from "./AppError.js";

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super({
      statusCode: 403,
      code: "FORBIDDEN",
      message,
    });

    this.name = "ForbiddenError";
  }
}
