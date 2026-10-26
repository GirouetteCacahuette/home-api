import { FastifyError, FastifyInstance } from 'fastify';

// Every Operation fails with an HTTP status and this body shape (see CONTEXT.md).
export const ErrorBody = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['error', 'message'],
} as const;

export class OperationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

export function registerErrorHandling(fastify: FastifyInstance) {
  fastify.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof OperationError) {
      req.log.warn({ code: err.code }, err.message);
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err.validation) {
      return reply.status(400).send({ error: 'invalid_request', message: err.message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal_error', message: 'Unexpected server error' });
  });

  fastify.setNotFoundHandler((req, reply) => {
    return reply
      .status(404)
      .send({ error: 'not_found', message: `No Operation at ${req.method} ${req.url}` });
  });
}
