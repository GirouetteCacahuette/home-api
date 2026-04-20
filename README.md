# home-api

Universal API for home automation and service integration. Built with Node.js, TypeScript, and Fastify.

## Prerequisites

- Node.js 20+
- Docker (optional)

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

The API will be available at `http://localhost:8000`. Swagger UI at `http://localhost:8000/docs`.

## Building

```bash
npm run build
npm start
```

## Docker

```bash
# Build and run with Docker
docker build -t home-api .
docker run -p 8000:8000 home-api

# Or with Docker Compose
docker compose up
```

## Environment Variables

| Variable  | Default       | Description              |
|-----------|---------------|--------------------------|
| PORT      | `8000`        | HTTP port to listen on   |
| HOST      | `0.0.0.0`     | Host address to bind     |
| NODE_ENV  | `development` | Runtime environment      |
| LOG_LEVEL | `info`        | Pino log level           |

## API Endpoints

| Method | Path              | Description              |
|--------|-------------------|--------------------------|
| GET    | `/health`         | Liveness check           |
| GET    | `/ready`          | Readiness check          |
| POST   | `/api/v1/http/call` | Make an outbound HTTP call |
| GET    | `/docs`           | Swagger UI               |

## How to Add a New Route

1. **Create a route file** in `src/routes/`, e.g. `src/routes/myfeature.ts`:

```typescript
import { FastifyInstance } from 'fastify';

export async function myFeatureRoutes(fastify: FastifyInstance) {
  fastify.get('/myfeature', {
    schema: {
      tags: ['myfeature'],
      summary: 'My feature endpoint',
      response: {
        200: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
      },
    },
  }, async () => {
    return { message: 'Hello from my feature!' };
  });
}
```

2. **Register the route** in `src/server.ts`:

```typescript
import { myFeatureRoutes } from './routes/myfeature.js';

// Inside buildServer():
await fastify.register(myFeatureRoutes, { prefix: '/api/v1' });
```

3. **Add a Swagger tag** (optional) in `src/plugins/swagger.ts` under the `tags` array.

4. **Write tests** in `tests/myfeature.test.ts` using `server.inject(...)`.

## Scripts

| Script             | Description                        |
|--------------------|------------------------------------|
| `npm run dev`      | Start with hot-reload (tsx watch)  |
| `npm run build`    | Compile TypeScript to `dist/`      |
| `npm start`        | Run compiled production build      |
| `npm test`         | Run Vitest tests                   |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint`     | Lint source files with ESLint      |
| `npm run format`   | Format code with Prettier          |
