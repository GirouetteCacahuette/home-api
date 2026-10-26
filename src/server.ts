import Fastify from 'fastify';
import { config } from './config.js';
import { registerErrorHandling } from './errors.js';
import { registerSwagger } from './plugins/swagger.js';
import { healthRoutes } from './routes/health.js';
import { dogRoutes } from './routes/dogs.js';
import { createDogCeo, DogImages } from './upstreams/dog-ceo.js';

export interface Upstreams {
  dogImages: DogImages;
}

export async function buildServer(upstreams: Partial<Upstreams> = {}) {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  const dogImages =
    upstreams.dogImages ??
    createDogCeo({ baseUrl: config.dogCeoBaseUrl, timeoutMs: config.upstreamTimeoutMs });

  registerErrorHandling(fastify);
  await registerSwagger(fastify);

  await fastify.register(healthRoutes);
  await fastify.register(dogRoutes, { dogImages });

  return fastify;
}
