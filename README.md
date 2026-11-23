# Campus Connect — College Management Portal

A full-stack college portal using Node.js, Express, MongoDB/Mongoose, vanilla JavaScript, Fetch/AJAX and locally bundled Bootstrap 5.

## Features

- Responsive student, faculty and administrator dashboards.
- Student self-registration; admin-created faculty/student accounts.
- bcrypt password hashing, MongoDB-backed login sessions, CSRF tokens, regenerated sessions, security headers and authentication rate limiting.
- Notices with author/admin deletion; upcoming events with capacity and duplicate-registration checks.
- Assignments, deadlines, one PDF submission per student, and protected faculty/owner downloads.
- Student complaints; student-private listings; administrator status updates.
- Profile editing, private resume uploads, paginated lists and dashboard counts.
- Server-side Zod validation, file size/type/signature checks, safe filenames and centralized errors.
- Unique indexes, reference-based data relationships, consistent list ordering and JSON REST endpoints.
- Integration tests with an actual temporary MongoDB process; Docker, Caddy HTTPS and GitHub CI.

## Start with Docker

Install Docker Desktop and start the Linux engine. Copy `.env.example` to `.env`, replace `SESSION_SECRET` with a random secret of at least 32 characters, set `ADMIN_EMAIL` and a 12+ character `ADMIN_PASSWORD`, and add:

```dotenv
MONGO_PASSWORD=choose-a-long-random-alphanumeric-password
```

Use letters/digits for this compose password, or correctly percent-encode it in the connection URI if you modify the setup. MongoDB is internal to the Docker network and has no public port.

```powershell
Copy-Item .env.example .env
# Edit .env before continuing.
docker compose up --build -d
docker compose exec app npm run seed
```

Open http://localhost:3000. Sign in with the admin email/password YOU configured. Seeding is explicit and never overwrites existing passwords.
Set an optional 12+ character `DEMO_PASSWORD` before seeding to add `student@college.test` and `faculty@college.test`. Sample notices, event and assignment are also inserted if their collections are empty. Disable demo accounts for production and remove any previously created demonstration users before launch.

## Run locally without Docker

Install Node.js 22+ and MongoDB 7+. Start MongoDB separately, then:

```powershell
Copy-Item .env.example .env
# Set secrets and a working MONGODB_URI in .env.
npm ci
npm run seed
npm start
```

The example local URI is `mongodb://127.0.0.1:27017/campus_connect`. Use authenticated MongoDB where appropriate. `npm ci` vendors Bootstrap locally through `scripts/vendor.js`, so the UI needs no CDN. Open http://localhost:3000.

To generate a session secret:

```text
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Roles and workflows

Students create an account, edit their profile, read notices, register for events, submit assignment PDFs and create support requests. My events shows their registrations; Submissions shows their own work. Resume download is restricted to the signed-in owner.

Faculty publish notices/events/assignments and review submissions for assignments they authored. Faculty can read support requests but only admins change complaint status. Notices may be deleted only by their author or an admin.

Admins create faculty/student accounts and have access to all submissions and support requests. Users cannot grant themselves staff/admin privileges through public registration. There is no public admin registration.

## REST endpoints

| Resource | Operations |
|---|---|
| `/api/session` | GET user and CSRF token |
| `/api/auth/register`, `/login`, `/logout` | POST authentication actions (full `/api/auth/` prefix) |
| `/api/dashboard` | GET scoped counts |
| `/api/me` | PATCH profile |
| `/api/me/resume` | POST PDF, GET private download |
| `/api/notices` | GET paginated, POST staff-only |
| `/api/notices/:id` | DELETE author/admin |
| `/api/events` | GET paginated, POST staff-only |
| `/api/events/:id/register` | POST student registration |
| `/api/registrations` | GET own event registrations |
| `/api/assignments` | GET paginated, POST staff-only |
| `/api/assignments/:id/submit` | POST PDF before deadline |
| `/api/submissions` | GET scoped submissions |
| `/api/submissions/:id/file` | GET authorized download |
| `/api/complaints` | GET scoped, POST student-only |
| `/api/complaints/:id` | PATCH admin status |
| `/api/users` | GET/POST admin-only |

Every modifying API request requires the current `x-csrf-token`, obtained from `/api/session` and refreshed after login/registration. Upload field: `file`. List endpoints accept `page` and `limit` (1–50); default limit is 8. Responses use `items`, `total`, `page`, `pages`. MongoDB failures are handled with generic client errors and server logs rather than leaked stack traces.

## Database design

Collections: users, notices, events, registrations, assignments, submissions, complaints and sessions. Mongoose references link authors, students, events and assignments; populated responses combine related records for display. No fake SQL-style join is used. Email is unique; event/student and assignment/student pairs are unique. Created-at and student-scoped indexes support lists.

MongoDB references are application-managed rather than database-enforced foreign keys. The app provides no destructive user/event/assignment deletion endpoints, preserving references. Event seat reservation uses an atomic counter plus compensating decrement if registration creation fails. Concurrent requests are protected, but an abrupt process crash between those two writes can leave the counter out of sync. For a high-traffic production system, use a replica-set transaction or a reconciliation job.

## Tests

```text
npm run check
npm test
```

Tests launch a real ephemeral MongoDB with `mongodb-memory-server`; the first run downloads MongoDB, so internet access, disk space and a supported OS are needed. Production has no dependency on that test server. Tests use an in-memory session store only; the running app uses MongoDB sessions.

Coverage includes login/session renewal/logout, hashing, CSRF, role escalation attempts, duplicate accounts, backend validation, pagination, notice ownership, concurrent event capacity, complaint privacy, admin-only updates, spoofed/oversized PDFs, submission deadlines, duplicate submissions and private downloads.

## HTTPS deployment

Use a Docker-capable server and a hostname with DNS pointing to it. Set strong secrets, add `DOMAIN=campus.your-domain.example` using your real hostname, disable demo seeding, and allow inbound ports 80/443.

```text
docker compose -f compose.yaml -f compose.production.yaml up --build -d
docker compose exec app npm run seed
docker compose logs -f app
```

Caddy obtains TLS certificates when DNS/network conditions are met. Production cookies are Secure/HttpOnly/SameSite=Lax; one trusted reverse-proxy hop is configured. Keep the app loopback-only and do not expose it directly behind an untrusted proxy. MongoDB and uploads persist in named volumes. App request logs are structured JSON on stdout; bodies and credentials are not logged. Back up both volumes consistently.

This ZIP supplies deployment configuration; it does not provision a live host, DNS or certificates. Docker deployment needs validation on your server. PDF checks are extension/MIME/size/signature checks, not malware scanning or complete PDF parsing. Add scanning, monitoring, email verification, password recovery, audit history and backup policies before real institutional use. Health endpoint `/health` reports process liveness, not database readiness.

## Git and source layout

`src/app.js`: API, middleware and authorization. `src/models.js`: schema/indexes. `src/seed.js`: account/content setup. `public/`: responsive frontend. `test/`: integration suite. `deploy/`: HTTPS proxy. `.github/workflows/ci.yml`: automated checks.

A local repository is initialized during packaging; `.git` is not included. After extracting:

```text
git init
git add .
git commit -m "Initial campus portal"
```

Never commit `.env`, node_modules, uploads or database files. Commit `package-lock.json` for repeatable installs. Bootstrap's MIT license is included in `public/vendor/`; other packages retain their own licenses.

## Syllabus mapping

HTML/CSS/Bootstrap: responsive forms, tables, cards, nav and layout. JavaScript DOM/forms/statements/functions/objects: frontend interactions. AJAX: Fetch API calls. Client-server/HTTP: REST APIs. Node/npm/modules/callbacks/events: server and dependencies. Express: routing/middleware. MongoDB: create collections via models, inserts, queries, sorted pagination, updates, deletion of notices and reference population.

Official references: https://expressjs.com/en/advanced/best-practice-security.html , https://www.mongodb.com/docs/manual/core/index-unique/ , https://getbootstrap.com/docs/5.3/

See `docs/TEST_REPORT.md` for observed verification and deployment limits. Passwords are limited to 72 UTF-8 bytes to avoid bcrypt truncation.
