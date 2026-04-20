import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    },
  );

  fastify.get(
    '/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              checks: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async () => {
      // Structured for future dependency checks
      const checks: Record<string, string> = {};
      return { status: 'ok', timestamp: new Date().toISOString(), checks };
    },
  );
}
