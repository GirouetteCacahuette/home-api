import Fastify from 'fastify';
import { config } from './config.js';
import { registerSwagger } from './plugins/swagger.js';
import { healthRoutes } from './routes/health.js';
import { httpRoutes } from './routes/http.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await registerSwagger(fastify);

  await fastify.register(healthRoutes);
  await fastify.register(httpRoutes, { prefix: '/api/v1' });

  return fastify;
}
