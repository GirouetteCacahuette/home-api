import { FastifyInstance } from 'fastify';
import { ErrorBody } from '../errors.js';
import { DogImages } from '../upstreams/dog-ceo.js';

export async function dogRoutes(fastify: FastifyInstance, { dogImages }: { dogImages: DogImages }) {
  fastify.get<{ Params: { breed: string } }>(
    '/dogs/:breed/random',
    {
      schema: {
        tags: ['dogs'],
        summary: 'Random image of a dog breed',
        description: 'Returns the image bytes directly, e.g. GET /dogs/pug/random.',
        params: {
          type: 'object',
          properties: { breed: { type: 'string', pattern: '^[A-Za-z]+$' } },
          required: ['breed'],
        },
        response: {
          200: {
            description: 'The image',
            content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
          },
          '4xx': ErrorBody,
          '5xx': ErrorBody,
        },
      },
    },
    async (req, reply) => {
      const image = await dogImages.randomImage(req.params.breed.toLowerCase());
      return reply.type(image.contentType).header('cache-control', 'no-store').send(image.body);
    },
  );
}
