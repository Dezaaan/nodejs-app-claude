# nodejs-app-claude

A notes REST API built with Node.js, TypeScript, Express 5 and PostgreSQL.

The API is served under `/api/v1`. It does not have authentication yet, so don't expose it publicly.

## Requirements

- Node.js 22.13 or newer
- Docker, for the local PostgreSQL database

## Getting started

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm run dev
```

The app listens on the `PORT` set in `.env`.

## API

| Method   | Path                | Description                   |
| -------- | ------------------- | ----------------------------- |
| `GET`    | `/health`           | The process is running        |
| `GET`    | `/ready`            | The database is reachable     |
| `GET`    | `/api/v1/notes`     | List, search and paginate     |
| `GET`    | `/api/v1/notes/:id` | Get one note                  |
| `POST`   | `/api/v1/notes`     | Create a note                 |
| `PATCH`  | `/api/v1/notes/:id` | Update a title and/or content |
| `DELETE` | `/api/v1/notes/:id` | Delete a note                 |

`GET /api/v1/notes` accepts `page`, `pageSize` (up to 100), `search`, `title`, `sortBy` (`createdAt`, `updatedAt` or `title`) and `sortOrder` (`asc` or `desc`).

Errors are returned as JSON:

```json
{ "error": { "code": "NOT_FOUND", "message": "Note not found" } }
```

## Configuration

| Variable           | Required | Default       | Description                                   |
| ------------------ | -------- | ------------- | --------------------------------------------- |
| `DATABASE_URL`     | Yes      |               | PostgreSQL connection string                  |
| `CLIENT_ORIGIN`    | Yes      |               | Origin allowed by CORS                        |
| `NODE_ENV`         | No       | `development` | `development`, `test` or `production`         |
| `PORT`             | No       | `4000`        | HTTP port                                     |
| `TRUST_PROXY_HOPS` | No       | `0`           | Number of reverse proxies in front of the app |
| `LOG_LEVEL`        | No       | `info`        | `debug`, `info`, `warn`, `error` or `silent`  |

Behind a reverse proxy, set `TRUST_PROXY_HOPS`. Otherwise all clients share one rate limit.

## Tests

`npm test` runs the unit tests and needs no database.

The API and integration tests delete data, so they refuse to run unless the database name ends in `_test`. To set them up, create a database called `nodejs_app_claude_test` and a `.env.test` file:

```bash
NODE_ENV=test
PORT=3001
DATABASE_URL=postgres://postgres:postgres@localhost:5432/nodejs_app_claude_test
CLIENT_ORIGIN=http://localhost:5173
LOG_LEVEL=silent
```

Then run:

```bash
npm run db:migrate:test
npm run test:all
```

## Scripts

| Script                                       | Description               |
| -------------------------------------------- | ------------------------- |
| `npm run dev`                                | Start with reload         |
| `npm run build` / `npm start`                | Compile and run the build |
| `npm run lint` / `npm run format:check`      | Check code quality        |
| `npm run typecheck`                          | Check types               |
| `npm run db:create-migration <name>`         | Create a migration        |
| `npm run db:migrate` / `npm run db:rollback` | Apply or undo a migration |

## Project structure

```text
src/
  app/             Dependency wiring
  config/          Environment validation and app config
  features/notes/  Routes, controller, service and repository
  infrastructure/  Logger, database and request context
  routes/          API router
  server/          HTTP server start and graceful shutdown
  shared/          Errors, HTTP helpers and pagination
  tests/           Unit, integration and API tests
database/migrations/
```

Each feature follows the same flow: route, controller, service, repository. Controllers declare their Zod schemas through `validatedHandler`, which types the validated input.

## Docker

```bash
docker build -t nodejs-app-claude .

# Apply migrations
docker run --rm -e DATABASE_URL=... nodejs-app-claude \
  node_modules/.bin/node-pg-migrate up -m database/migrations

# Start the app
docker run -p 3000:3000 -e PORT=3000 -e DATABASE_URL=... -e CLIENT_ORIGIN=... nodejs-app-claude
```
