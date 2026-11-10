import type { Request, RequestHandler, Response } from "express";
import type { output, ZodType } from "zod";

type RequestSchemas = {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
};

type ValidatedInput<TSchemas extends RequestSchemas> = {
  [Key in keyof TSchemas]: TSchemas[Key] extends ZodType
    ? output<TSchemas[Key]>
    : never;
};

// Validates the request, then calls the handler with input typed from the
// schemas. Express 5 forwards rejected promises to the error middleware.
export const validatedHandler = <TSchemas extends RequestSchemas>(
  schemas: TSchemas,
  handler: (
    input: ValidatedInput<TSchemas>,
    response: Response,
    request: Request,
  ) => Promise<void>,
): RequestHandler => {
  return async (request, response) => {
    const input = {
      ...(schemas.params && { params: schemas.params.parse(request.params) }),
      ...(schemas.query && { query: schemas.query.parse(request.query) }),
      ...(schemas.body && { body: schemas.body.parse(request.body) }),
    };

    await handler(input as ValidatedInput<TSchemas>, response, request);
  };
};
