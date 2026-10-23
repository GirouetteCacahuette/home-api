# home-api

A personal API of purpose-built **Operations** over public services and self-hosted apps, meant to be called from iOS Shortcuts or a browser. Built with Node.js, TypeScript, and Fastify.

It is reachable from the **Home network** only (LAN + Tailscale) and has no authentication on purpose; see [ADR 0002](docs/adr/0002-home-network-is-the-only-auth.md). Never expose it through a public reverse proxy.

Vocabulary lives in [CONTEXT.md](CONTEXT.md); decisions in [docs/adr](docs/adr).

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
| UPSTREAM_TIMEOUT_MS | `5000` | Timeout for each call to an Upstream |
| DOG_CEO_BASE_URL | `https://dog.ceo/api` | dog.ceo API base URL |

## API Endpoints

| Method | Path              | Description              |
|--------|-------------------|--------------------------|
| GET    | `/health`         | Liveness check           |
| GET    | `/dogs/{breed}/random` | Random image of a breed, returned as image bytes (e.g. `/dogs/pug/random`) |
| GET    | `/docs`           | Swagger UI               |

Operations are grouped by intent (`/dogs`, later `/budget`, `/tasks`), never by Upstream name; see [ADR 0001](docs/adr/0001-operations-grouped-by-intent.md). There is no URL prefix, so `health` and `docs` are reserved.

### Errors

Every failure answers with an HTTP status and the same JSON body:

```json
{ "error": "unknown_breed", "message": "dog.ceo has no breed \"unicorn\"" }
```

| Status | `error`            | Meaning                                 |
|--------|--------------------|-----------------------------------------|
| 400    | `invalid_request`  | Malformed parameters                    |
| 404    | `unknown_breed`    | dog.ceo has no such breed               |
| 404    | `not_found`        | No Operation at that path               |
| 502    | `upstream_failed`  | An Upstream errored or was unreachable  |
| 504    | `upstream_timeout` | An Upstream did not answer in time      |

In iOS Shortcuts, "Get Contents of URL" does not stop on errors: check whether the result has an `error` key before using it.

## How to Add a New Operation

1. If it needs a new Upstream, add a client in `src/upstreams/` that throws `OperationError` (from `src/errors.ts`) on failure, and wire it into `Upstreams` in `src/server.ts` so tests can inject a fake.
2. Add a route file in `src/routes/` named after the intent (e.g. `budget.ts`), using `ErrorBody` for its `4xx`/`5xx` response schemas, and register it in `buildServer()`.
3. Add a Swagger tag in `src/plugins/swagger.ts`.
4. Write tests in `tests/` with `server.inject(...)` and a fake Upstream (see `tests/dogs.test.ts`).

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
