# nodejs-app-claude

A notes REST API built with Node.js, TypeScript, Express 5 and PostgreSQL.

The API is served under `/api/v1`. Users sign up and log in, and each user can only see and change their own notes.

## Requirements

- Node.js 22.13 or newer
- Docker, for the local PostgreSQL database

## Getting started

```bash
npm install
cp .env.example .env   # then set JWT_SECRET to a random value
docker compose up -d postgres
npm run db:migrate
npm run dev
```

The app listens on the `PORT` set in `.env`.

To browse the database, run `docker compose up -d adminer` and open http://localhost:8080. Log in as `postgres` / `postgres` with the system set to PostgreSQL, the server set to `postgres` and the database set to `nodejs_app_claude`.

## API

| Method   | Path                    | Description                           |
| -------- | ----------------------- | ------------------------------------- |
| `GET`    | `/health`               | The process is running                |
| `GET`    | `/ready`                | The database is reachable             |
| `POST`   | `/api/v1/auth/register` | Create an account and start a session |
| `POST`   | `/api/v1/auth/login`    | Start a session                       |
| `POST`   | `/api/v1/auth/refresh`  | Get a new access token                |
| `POST`   | `/api/v1/auth/logout`   | End the current session               |
| `GET`    | `/api/v1/auth/me`       | Get the logged-in user                |
| `GET`    | `/api/v1/notes`         | List, search and paginate             |
| `GET`    | `/api/v1/notes/:id`     | Get one note                          |
| `POST`   | `/api/v1/notes`         | Create a note                         |
| `PATCH`  | `/api/v1/notes/:id`     | Update a title and/or content         |
| `DELETE` | `/api/v1/notes/:id`     | Delete a note                         |

`GET /api/v1/notes` accepts `page`, `pageSize` (up to 100), `search`, `title`, `sortBy` (`createdAt`, `updatedAt` or `title`) and `sortOrder` (`asc` or `desc`).

All notes routes require an access token and a permission (see [Roles and permissions](#roles-and-permissions)). Another user's note returns 404, as if it didn't exist.

Errors are returned as JSON:

```json
{ "error": { "code": "NOT_FOUND", "message": "Note not found" } }
```

## Authentication

Sessions use two tokens:

| Token         | Lifetime   | Where it lives                                                                   |
| ------------- | ---------- | -------------------------------------------------------------------------------- |
| Access token  | 15 minutes | Response body. Keep it in memory and send it as `Authorization: Bearer <token>`. |
| Refresh token | 30 days    | `httpOnly`, `Secure`, `SameSite=Strict` cookie, sent only to `/api/v1/auth`.     |

Register, login and refresh return `{ user, permissions, accessToken, accessTokenExpiresIn }` and set the refresh token cookie. `GET /me` returns `{ user, permissions }`.

Each refresh replaces the refresh token with a new one. If an old refresh token is used again, the token was probably copied, so the whole session is ended. Logout ends only the current session.

The app deletes expired refresh tokens when it starts and then every hour. Used and logged-out tokens are kept until they expire, because they're needed to detect a copied token.

### Using it from a frontend

- Call `POST /api/v1/auth/refresh` on page load to get an access token, since memory is cleared on reload. A 401 means the user is logged out.
- Send auth requests with `credentials: "include"` so the browser sends and stores the cookie.
- When an access token expires (401), call refresh once and retry the request.
- Open the frontend and API with the same hostname. `localhost` and `127.0.0.1` are different sites, and the cookie won't be sent between them.
- In production, serve the frontend and API from the same parent domain, for example `app.example.com` and `api.example.com`. On unrelated domains, browsers treat the cookie as third-party and may block it.

Auth routes reject requests whose `Origin` header doesn't match `CLIENT_ORIGIN`, and are limited to 20 requests per minute per IP.

### Roles and permissions

Each user has one role. The backend maps roles to permissions in [src/shared/auth/permissions.ts](src/shared/auth/permissions.ts) and checks them on every request. A missing permission returns 403 `FORBIDDEN`.

| Role     | Permissions                | Notes routes                  |
| -------- | -------------------------- | ----------------------------- |
| `user`   | `notes.view`, `notes.edit` | All                           |
| `viewer` | `notes.view`               | `GET` only; others return 403 |

New accounts get `user`. Roles can't be changed through the API, only with this command:

```bash
npm run user:set-role -- ana@example.com viewer
```

The role is stored in the access token, so a change takes effect at the user's next refresh, within 15 minutes.

The frontend should use `permissions` only to show or hide actions. Check permissions, not role names, so new roles don't need frontend changes.

## Configuration

| Variable                   | Required | Default       | Description                                                             |
| -------------------------- | -------- | ------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`             | Yes      |               | PostgreSQL connection string                                            |
| `CLIENT_ORIGIN`            | Yes      |               | Frontend origin, allowed by CORS and the auth routes                    |
| `JWT_SECRET`               | Yes      |               | Access token signing key, at least 32 characters                        |
| `ACCESS_TOKEN_TTL_SECONDS` | No       | `900`         | Access token lifetime                                                   |
| `REFRESH_TOKEN_TTL_DAYS`   | No       | `30`          | Refresh token lifetime                                                  |
| `COOKIE_SECURE`            | No       | `true`        | Set to `false` only for local HTTP development in browsers that need it |
| `NODE_ENV`                 | No       | `development` | `development`, `test` or `production`                                   |
| `PORT`                     | No       | `4000`        | HTTP port                                                               |
| `TRUST_PROXY_HOPS`         | No       | `0`           | Number of reverse proxies in front of the app                           |
| `LOG_LEVEL`                | No       | `info`        | `debug`, `info`, `warn`, `error` or `silent`                            |

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
JWT_SECRET=any-test-secret-that-is-at-least-32-characters
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
| `npm run user:set-role -- <email> <role>`    | Change a user's role      |

## Project structure

```text
src/
  app/             Dependency wiring
  config/          Environment validation and app config
  features/auth/   Users, sessions, tokens and the requireAuth middleware
  features/notes/  Routes, controller, service and repository
  infrastructure/  Logger, database and request context
  routes/          API router
  scripts/         Operator commands, such as changing a user's role
  server/          HTTP server start and graceful shutdown
  shared/          Errors, HTTP helpers, permissions and pagination
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

# Change a user's role
docker run --rm -e DATABASE_URL=... -e CLIENT_ORIGIN=... -e JWT_SECRET=... nodejs-app-claude \
  node dist/scripts/setUserRole.js ana@example.com viewer

# Start the app
docker run -p 3000:3000 -e PORT=3000 -e DATABASE_URL=... -e CLIENT_ORIGIN=... -e JWT_SECRET=... nodejs-app-claude
```
