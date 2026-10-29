import { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(fastify: FastifyInstance) {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Home API',
        description:
          'Purpose-built Operations over public services and self-hosted apps, for the Home network only',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: 'Liveness check' },
        { name: 'dogs', description: 'Dog pictures (Upstream: dog.ceo)' },
        {
          name: 'budget',
          description: 'Shared expenses synced into Actual (Upstreams: Tricount, Actual Budget)',
        },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });
}
