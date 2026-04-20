import { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(fastify: FastifyInstance) {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Home API',
        description: 'Universal API for home automation and service integration',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: 'Health and readiness endpoints' },
        { name: 'http', description: 'Outbound HTTP call endpoints' },
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
