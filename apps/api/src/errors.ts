/**
 * Error handling. Services throw AppError; the handler below turns every
 * error into the contract's `{ error: { code, message, details? } }` shape.
 * Unexpected errors become a generic 500 so internals never leak to clients.
 */
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { Prisma } from "./generated/prisma/client.js";

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    /** Stable, machine-readable code, e.g. "LAST_PARENT". Clients branch on this. */
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (code: string, message: string) => new AppError(401, code, message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);

/** True for a Postgres unique-constraint violation (e.g. an email that's already taken). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request is invalid.",
          details: error.validation.map((v) => ({
            path: v.instancePath || "/",
            message: v.message ?? "Invalid value",
          })),
        },
      });
    }
    // Fastify's own client errors: malformed JSON, wrong content type, rate limits, ...
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.status(status).send({
        error: {
          code: status === 429 ? "RATE_LIMITED" : (error.code ?? "BAD_REQUEST"),
          message: error.message,
        },
      });
    }
    request.log.error({ err: error }, "Unhandled error");
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: "ROUTE_NOT_FOUND", message: `No route for ${request.method} ${request.url}` },
    }),
  );
}
