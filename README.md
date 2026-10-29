# home-api

A personal API of purpose-built **Operations** over public services and self-hosted apps, meant to be called from iOS Shortcuts or a browser. Built with Node.js, TypeScript, and Fastify.

It is reachable from the **Home network** only (LAN + Tailscale) and has no authentication on purpose, write Operations included; see [ADR 0002](docs/adr/0002-home-network-is-the-only-auth.md) and [ADR 0003](docs/adr/0003-write-operations-stay-unauthenticated.md). Never expose it through a public reverse proxy.

Vocabulary lives in [CONTEXT.md](CONTEXT.md); decisions in [docs/adr](docs/adr).

## Prerequisites

- Node.js 24+
- A checkout of [tricount-actual-sync](https://github.com/GirouetteCacahuette/tricount-actual-sync) (private) next to this repo, built (`npm ci` there builds `dist/`): `package.json` depends on it as `file:../tricount-actual-sync`
- Docker (optional)

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

The API will be available at `http://localhost:8000`. Swagger UI at `http://localhost:8000/docs`, the UI at `http://localhost:8000/ui/`.

## Building

```bash
npm run build
npm start
```

## Docker

The image fetches the private tricount-actual-sync repo at build time, at the ref in the `TRICOUNT_SYNC_REF` build arg, with BuildKit's `ADD` of a git URL. It authenticates with a GitHub token passed as the `GIT_AUTH_TOKEN` build secret: the secret is mounted for that fetch only and is never written to the image or a layer.

Create a fine-grained personal access token on GitHub with **read-only "Contents"** access to `GirouetteCacahuette/tricount-actual-sync` only, and keep it out of `.env` and the shell history (e.g. in a password manager or a file only you can read):

```bash
export GIT_AUTH_TOKEN=$(cat ~/.config/home-api/github-token)   # read it, don't type it

docker compose build                              # real
docker compose -f docker-compose.dev.yml build    # dev

# Without Compose:
docker build --secret id=GIT_AUTH_TOKEN,env=GIT_AUTH_TOKEN --build-arg TRICOUNT_SYNC_REF=main -t home-api .
```

Two Compose files run side by side:

| File | Project | tricount-actual-sync ref | Actual | Port | Tricount list |
|------|---------|--------------------------|--------|------|---------------|
| `docker-compose.yml` (real) | `home-api` | `main` | `ACTUAL_API_URL` (required) | `PORT`, default `8000` | volume `home-api_tricount-config` |
| `docker-compose.dev.yml` (dev) | `home-api-dev` | `dev` | `DEV_ACTUAL_API_URL`, default local-stack's `http://actual_api:3000` (joins the `local-stack_default` network) | `DEV_PORT`, default `8001` | volume `home-api-dev_tricount-config-dev` |

The real one also loads `.env` into the container. The dev one reads only `DEV_`-prefixed variables (`DEV_PORT`, `DEV_ACTUAL_API_URL`, `DEV_HOME_CURRENCY`, `DEV_TRICOUNT_MIN_INTERVAL_SECONDS`), so the real `.env` can never point it at the real Actual. Override the ref for one build with `--build-arg TRICOUNT_SYNC_REF=<branch>`.

Both mount the **same** Tricount session dir, `TRICOUNT_SESSION_DIR` on the host (default `./data/tricount-session`), so they share one Tricount device and one rate limiter with each other and with the tricount-actual-sync CLI. Create it before the first `up` (the container runs as uid 1000; a directory Docker creates would belong to root):

```bash
mkdir -p data/tricount-session
docker compose up -d
docker compose -f docker-compose.dev.yml up -d
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
| ACTUAL_API_URL | `http://localhost:3000` | actual-api base URL |
| HOME_CURRENCY | `EUR` | The only currency a shared expense can be in to be added |
| TRICOUNT_SESSION_DIR | `data/tricount-session` | Tricount device credentials and last-call time; share it with every process talking to Tricount |
| TRICOUNT_CONFIG_DIR | `data/tricount-config` | Holds this instance's `tricounts.json` |
| TRICOUNT_MIN_INTERVAL_SECONDS | `30` | Minimum gap between Tricount calls (whole number ≥ 1) |

## API Endpoints

| Method | Path              | Description              |
|--------|-------------------|--------------------------|
| GET    | `/health`         | Liveness check           |
| GET    | `/dogs/{breed}/random` | Random image of a breed, returned as image bytes (e.g. `/dogs/pug/random`) |
| GET    | `/budget/shared-expenses/preview?link=` | Preview a tricount from its share link or key |
| POST   | `/budget/shared-expenses` | Add a previewed tricount: create its Actual account, save it, run its first sync |
| GET    | `/docs`           | Swagger UI               |
| GET    | `/ui/`            | The UI (static page)     |

Operations are grouped by intent (`/dogs`, `/budget`, later `/tasks`), never by Upstream name; see [ADR 0001](docs/adr/0001-operations-grouped-by-intent.md). There is no URL prefix, so `health`, `docs` and `ui` are reserved.

### Adding a shared expense

The UI's "Add a tricount" section drives these two Operations; the logic is tricount-actual-sync's.

`GET /budget/shared-expenses/preview?link=https://tricount.com/<key>` makes one Tricount call and answers the tricount's `key`, `title`, `currency` and `members` (each `{ id, name, active, selectable, reason? }`), plus `homeCurrency`, `currencySupported`, `suggestedAccountName` (`Tricount: <title>`), `existingAccountNames` (every Actual account, closed ones included) and `retryAfterSeconds` (until the next Tricount call is allowed). Inside the rate limit it answers `429 rate_limited` with a `Retry-After` header instead of waiting.

`POST /budget/shared-expenses` with `{ "key", "myMemberName", "accountName" }` needs a preview of that key from the last 15 minutes: the title, members and currency come from it, never from the request. It re-checks everything first (key not added yet, currency is `HOME_CURRENCY`, the member exists and is selectable, no Actual account has that name once trimmed), then creates the account, saves the tricount to `tricounts.json` and runs its first sync. That sync waits for the Tricount rate-limit slot the preview took, so the request can take up to `TRICOUNT_MIN_INTERVAL_SECONDS`. It answers `201` with `{ added: true, steps }`, each step (`check`, `createAccount`, `saveConfig`, `firstSync`) `done`, `failed` with its `error`, or `skipped`; a failed first sync still answers `201` (the next sync retries it). When a step before that fails, nothing is rolled back: it answers `add_failed` with the same `added` and `steps`, and `steps.saveConfig.orphanedAccount` names an account that was created but not saved.

### Errors

Every failure answers with an HTTP status and the same JSON body:

```json
{ "error": "unknown_breed", "message": "dog.ceo has no breed \"unicorn\"" }
```

| Status | `error`            | Meaning                                 |
|--------|--------------------|-----------------------------------------|
| 400    | `invalid_request`  | Malformed parameters                    |
| 400    | `invalid_link`     | Not a Tricount share link or key        |
| 400    | `unknown_member`   | The previewed tricount has no member by that name |
| 400    | `member_not_selectable` | Several members share that name: rename one in Tricount |
| 404    | `unknown_breed`    | dog.ceo has no such breed               |
| 404    | `not_found`        | No Operation at that path               |
| 409    | `preview_required` | No preview of that key in the last 15 minutes: preview it again |
| 409    | `already_configured` | That tricount is already added        |
| 409    | `account_name_taken` | Actual already has an account by that name (trimmed) |
| 409    | `add_in_progress`  | The same tricount is being added right now |
| 409, 500, 502 | `add_failed` | A step of the add failed (`check`, saving, creating the account); the body also has `added` and `steps` |
| 422    | `unsupported_currency` | The tricount is not in `HOME_CURRENCY` |
| 429    | `rate_limited`     | Tricount's rate limit: retry after the `Retry-After` seconds |
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
| `npm run lint`     | Lint source files and the UI with ESLint |
| `npm run format`   | Format code and the UI with Prettier |
