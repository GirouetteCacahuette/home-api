import { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';

// The repo's ui/ directory, from src/routes (tsx) or dist/routes (built) alike.
const UI_DIR = fileURLToPath(new URL('../../ui/', import.meta.url));

// Plain static files: the page calls the JSON Operations like any Client.
export async function uiRoutes(fastify: FastifyInstance) {
  await fastify.register(fastifyStatic, { root: UI_DIR, prefix: '/ui', redirect: true });
}
