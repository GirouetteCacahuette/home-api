import { FastifyInstance } from 'fastify';
import { request } from 'undici';
import { Static, Type } from '@sinclair/typebox';

const HttpCallBody = Type.Object({
  url: Type.String({ format: 'uri', description: 'Target URL to call' }),
  method: Type.Optional(
    Type.Union(
      [
        Type.Literal('GET'),
        Type.Literal('POST'),
        Type.Literal('PUT'),
        Type.Literal('PATCH'),
        Type.Literal('DELETE'),
      ],
      { default: 'GET', description: 'HTTP method' },
    ),
  ),
  headers: Type.Optional(
    Type.Record(Type.String(), Type.String(), { description: 'Request headers' }),
  ),
  body: Type.Optional(Type.String({ description: 'Request body as string' })),
  timeoutMs: Type.Optional(
    Type.Number({ minimum: 1, maximum: 30000, default: 5000, description: 'Timeout in ms' }),
  ),
});

type HttpCallBodyType = Static<typeof HttpCallBody>;

const HttpCallResponse = Type.Object({
  statusCode: Type.Number(),
  headers: Type.Record(Type.String(), Type.String()),
  body: Type.String(),
});

export async function httpRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: HttpCallBodyType }>(
    '/http/call',
    {
      schema: {
        tags: ['http'],
        summary: 'Make an outbound HTTP call',
        body: HttpCallBody,
        response: {
          200: HttpCallResponse,
        },
      },
    },
    async (req, reply) => {
      const { url, method = 'GET', headers = {}, body, timeoutMs = 5000 } = req.body;

      try {
        const response = await request(url, {
          method,
          headers,
          body: body ?? undefined,
          bodyTimeout: timeoutMs,
          headersTimeout: timeoutMs,
        });

        const responseBody = await response.body.text();
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') {
            responseHeaders[key] = value;
          } else if (Array.isArray(value)) {
            responseHeaders[key] = value.join(', ');
          }
        }

        return reply.status(200).send({
          statusCode: response.statusCode,
          headers: responseHeaders,
          body: responseBody,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(502).send({
          error: 'Bad Gateway',
          message: `Outbound request failed: ${message}`,
        });
      }
    },
  );
}
