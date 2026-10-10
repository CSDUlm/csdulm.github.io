# CSD seminar administration API

The public website stays static on GitHub Pages. This small, separate Cloudflare Worker is required for password-protected seminar editing. GitHub Pages cannot securely check a password or keep a server credential by itself. Without a configured Worker, the public site remains available and the seminar administration interface stays locked.

Seminars live in the versioned `data/seminars.json` file in this repository. An authenticated change creates a GitHub commit, then the normal Pages deployment publishes it. Historical records and their source metadata are preserved. A private Cloudflare D1 database stores only revocable login sessions and login throttle counters.

## What users need

Users need only the password supplied by CSD. They do not need a GitHub account, a Cloudflare account, or a personal access token:

- `/admin/`: the organiser password permits adding and removing seminars.

All setup below is performed once by a CSD administrator. `GITHUB_TOKEN` is a server-side service credential used to publish seminars on behalf of users. It is never requested from an end user or exposed to their browser.

Passwords travel over HTTPS and are stored as salted, one-way hashes. The server checks a hash rather than decrypting a stored password. Do not send plaintext passwords in repository issues, commits, or setup instructions.

## Security design

- The seminar password is checked only on the server against salted PBKDF2-SHA256 hashes. The server stores no plaintext password. The local password tool hides its input and requires at least 20 characters; use a randomly generated passphrase from a password manager.
- Sessions last 30 minutes, are HMAC-signed, and have a revocable D1 session record. The browser keeps its bearer token only in memory. Refreshing or closing the page signs the user out. No password or session token belongs in cookies, browser storage, URLs, HTML, source code, or Git.
- In-memory bearer sessions work across GitHub Pages and `workers.dev` without relying on third-party cookies. The frontend sends `Authorization: Bearer …` on private requests. No cookies are issued or needed.
- An exact allowlist of website origins is mandatory for every private request and mutation. Sessions are bound to the origin where they were created. CORS cannot use wildcards. This supplements authentication; it does not replace the password check.
- D1 atomically counts all login attempts, including successful attempts: at most five per IP address, and 50 globally, per 15-minute window. IPs are HMAC-hashed before storage. Missing production client IP, missing secrets, unavailable D1, and invalid configuration fail closed.
- Names, dates, lengths, URLs and JSON size are checked on the server. Prepared SQL statements bind all user input. API responses use `no-store`, and internal database/provider errors and credentials are never returned or logged by this code.
- GitHub's existing file SHA makes seminar writes conditional. Conflicting changes are reread and merged before retrying, so simultaneous edits do not silently replace each other.

This is a shared-password system: anyone with the seminar password can add and remove seminars. Use institutional SSO/Cloudflare Access instead if you need individual identities, staff departure management, or an audit trail per person. A hidden URL provides no security; the Worker authentication is the access boundary. Restrict Cloudflare account access to the administrators responsible for the service.

Cloudflare Workers currently limits production PBKDF2 calls to 100,000 iterations. This implementation uses that supported maximum together with strong passwords and persistent online throttling. Revisit the iteration count and hash format when the platform lifts its limit. See [Cloudflare's Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) and the [open workerd change to raise the cap](https://github.com/cloudflare/workerd/pull/7550).

## Production setup

Run commands from `worker/`. Node 22.13 or later is needed for the dependency-free local test suite. The deployment and runtime verification tools are pinned in `package-lock.json`; install them with `npm ci` before using Wrangler. The included configuration allocates enough CPU for password verification and expects the Workers paid plan; check current [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) and pricing before enabling production. This repository does not create an account or subscribe to a paid plan.

1. Test the API:

   ```sh
   npm test
   npm ci
   npm run test:runtime
   ```

   `test:runtime` also exercises the API in Cloudflare's local workerd runtime, including password verification, session revocation and the production D1 schema. It starts a local connection and creates only temporary local test data; it does not contact or deploy to Cloudflare.

2. Sign into the Cloudflare account that will own the private service and create D1:

   ```sh
   npx wrangler login
   npx wrangler d1 create csd-private
   ```

   Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.toml` with the returned database UUID. Keep the binding name `DB`. Do not publish the Worker with a placeholder database ID.

3. Confirm the configuration in `wrangler.toml`:

   - `GITHUB_REPOSITORY = "CSDUlm/csdulm.github.io"`
   - `GITHUB_BRANCH` must be the branch that publishes the site.
   - `ALLOWED_ORIGINS` is a comma-separated list of exact origins, such as `https://csdulm.github.io,https://csd.ens.psl.eu`. Include only domains serving this site. An origin has no trailing slash or path; do not use `*`, a domain suffix, or an HTTP production origin.
   - Optionally set up a custom API domain such as an institution-controlled `api` subdomain using the commented route example. A `workers.dev` domain works with the in-memory session design.

4. Apply the database migration:

   ```sh
   npx wrangler d1 migrations apply csd-private --remote
   ```

5. Generate a salted hash for the seminar password using a local terminal. This tool never accepts a password as a command-line argument:

   ```sh
   npm run hash-password
   ```

   Copy the resulting **hash**, then paste it into the Wrangler secret prompt. Do not save the hash or password in any committed file:

   ```sh
   npx wrangler secret put SEMINAR_PASSWORD_HASH
   ```

6. Generate 32 random bytes for the session signing secret (64 hexadecimal characters). Paste the output into Wrangler's secret prompt:

   ```sh
   openssl rand -hex 32
   npx wrangler secret put SESSION_SECRET
   ```

7. Create a GitHub fine-grained personal access token, selecting only this repository, with repository **Contents: read and write** permission. Use an appropriate expiry and an account authorized to commit to the publishing branch. Store it only as a Worker secret:

   ```sh
   npx wrangler secret put GITHUB_TOKEN
   ```

   A restricted GitHub App installation token is also suitable if you manage token renewal. GitHub's file endpoint needs the existing file SHA for updates; this Worker retries conflicting writes against the latest file. Branch protection can require a service account exemption or a different publication workflow. See [GitHub repository contents permissions and conditional updates](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).

8. Deploy:

   ```sh
   npx wrangler deploy
   ```

   Set the GitHub repository's **Actions variable** `CSD_API_URL` to the returned HTTPS Worker URL, then rerun the **Publish CSD website** workflow. The site build generates `assets/js/config.js` from that variable; do not edit the generated configuration file. Only the public API URL belongs in this variable; never add a password, token or hash.

9. Verify from the deployed website: a wrong password fails; the correct seminar password adds and removes a test seminar; no GitHub login is requested. Refresh the page and verify sign-in is required again. Verify unauthenticated seminar changes fail.

The hourly maintenance task removes expired sessions and old login throttle counters.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, replace every placeholder with local-only values, and run:

```sh
npx wrangler d1 migrations apply csd-private --local
npx wrangler dev
```

In another terminal, build and preview the site from the **repository root**:

```sh
CSD_API_URL=http://127.0.0.1:8787 npm run build
npm run preview
```

Open `http://127.0.0.1:4175`. The development allowlist must exactly match the website's local server origin (`http://localhost:4175` and `http://127.0.0.1:4175` are separate origins). HTTP is allowed only with `ENVIRONMENT="development"` and only on localhost. A GitHub token in local development can still change the real repository: use a separate test repository/branch if testing seminar writes. `.dev.vars`, local D1 files and dependencies are ignored by Git. Never enable a permissive development configuration in production.

## API contract

All request/response bodies are JSON. Every private request supplies an allowed `Origin` (normal browser `fetch` supplies it) and `Authorization: Bearer <token>`. Login requires `Origin` and sends `{role:"seminars",password}`. Do not set `credentials: "include"`; no cookies are used. Session expiry is returned as an ISO UTC string.

| Method | Endpoint | Access | Request / response |
| --- | --- | --- | --- |
| POST | `/auth/login` | Allowed origin | `{role:"seminars",password}` → `{token,role,expiresAt}` |
| GET | `/auth/session` | Signed-in organizer | → `{role,expiresAt}` |
| POST | `/auth/logout` | Signed-in organizer | Revokes session → `{ok:true}` |
| GET | `/seminars` | Public | → entire seminar database document |
| POST | `/seminars` | Signed-in organizer | `{speaker,institution,title,date,room?,abstract?,url?}` → `{seminar}` (201) |
| DELETE | `/seminars/<id>` | Signed-in organizer | → `{ok:true}` |

New seminar dates must include a timezone; the API stores them in UTC and marks `timeKnown:true`. The room defaults to `Room W`. Historical date-only entries with `timeKnown:false` and unknown rooms remain intact. Optional abstract text is plain text; optional URLs must use HTTPS. The database has a 950 KiB write limit to stay below GitHub's 1 MB inline-contents ceiling; move to a raw-file read workflow or split the archive if it approaches that size.

Errors return `{error:"Human-readable message"}`. Common statuses: `400` invalid fields; `401` wrong password or missing/expired/revoked session; `403` wrong origin; `404` missing record; `409` concurrent seminar conflict; `413` oversized data; `429` login throttle with `Retry-After`; `503` unconfigured or unavailable secure service. Clear the in-memory session and display sign-in on `401`.

## Operations and verification

To revoke all sessions immediately, rotate `SESSION_SECRET` and delete all D1 session records. To change the seminar password, generate a new hash, replace `SEMINAR_PASSWORD_HASH`, and remove existing D1 sessions. Logout revokes only the current session. No individual-user ownership is implied by shared passwords.

`npm test` uses Node's test runner and actual SQLite with the production migration. It checks access control, exact origins, session tampering/expiry/revocation, fail-closed configuration and database failure, durable rate limits (including resistance to one blocked IP exhausting the global budget), validation, public-secret separation, GitHub conflict retries and preservation of historical metadata. The Worker and this unit test suite have no package dependencies. The optional `npm run test:runtime` suite uses the pinned Miniflare/workerd development tools to verify actual Cloudflare password/session/D1 behavior with only the seminar password hash configured.

See [Cloudflare's SQLite-compatible SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/) and [primary-consistent D1 sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession). Cloudflare credentials, production D1 and GitHub service secrets are intentionally not included in this repository.
