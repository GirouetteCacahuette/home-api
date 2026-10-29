import Fastify from 'fastify';
import { config } from './config.js';
import { registerErrorHandling } from './errors.js';
import { registerSwagger } from './plugins/swagger.js';
import { healthRoutes } from './routes/health.js';
import { dogRoutes } from './routes/dogs.js';
import { budgetRoutes } from './routes/budget.js';
import { uiRoutes } from './routes/ui.js';
import { SharedExpensePreviews } from './shared-expense-previews.js';
import { createDogCeo, DogImages } from './upstreams/dog-ceo.js';
import {
  createSharedExpenseUpstreams,
  SharedExpenseUpstreams,
} from './upstreams/shared-expenses.js';

// How long a preview vouches for the tricount it showed (see SharedExpensePreviews).
const PREVIEW_TTL_MS = 15 * 60 * 1000;

export interface Upstreams {
  dogImages: DogImages;
  sharedExpenses: SharedExpenseUpstreams;
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

  const sharedExpenses =
    upstreams.sharedExpenses ??
    createSharedExpenseUpstreams({
      actualApiUrl: config.actualApiUrl,
      sessionDir: config.tricountSessionDir,
      configDir: config.tricountConfigDir,
      minIntervalSeconds: config.tricountMinIntervalSeconds,
      timeoutMs: config.upstreamTimeoutMs,
    });

  registerErrorHandling(fastify);
  await registerSwagger(fastify);

  await fastify.register(healthRoutes);
  await fastify.register(dogRoutes, { dogImages });
  await fastify.register(budgetRoutes, {
    sharedExpenses,
    homeCurrency: config.homeCurrency,
    previews: new SharedExpensePreviews(PREVIEW_TTL_MS),
  });
  await fastify.register(uiRoutes);

  return fastify;
}
