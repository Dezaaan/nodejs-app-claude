import { AppError } from "./AppError.js";

export class BadRequestError extends AppError {
  constructor(code: string, message: string) {
    super({
      statusCode: 400,
      code,
      message,
    });

    this.name = "BadRequestError";
  }
}
