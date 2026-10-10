import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const origin = 'https://csdulm.github.io';
const password = 'runtime-only-seminar-test-passphrase';
const salt = Buffer.alloc(16, 3);
const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url')}`;

test('Cloudflare workerd executes password-only seminar sign-in, origin checks and D1 revocation', async (t) => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: fileURLToPath(new URL('../src/index.mjs', import.meta.url)),
    compatibilityDate: '2026-10-10',
    cf: false,
    d1Databases: { DB: '00000000-0000-0000-0000-000000000001' },
    bindings: {
      ENVIRONMENT: 'production', ALLOWED_ORIGINS: origin,
      SEMINAR_PASSWORD_HASH: hash, SESSION_SECRET: 'c3'.repeat(32),
    },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migration = readFileSync(new URL('../migrations/0001_private_api.sql', import.meta.url), 'utf8');
  const statements = migration.trim().split(/;\s*(?=CREATE)/);
  await db.batch(statements.map((statement) => db.prepare(statement.trim())));
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  assert.deepEqual(tables.results.map(({ name }) => name).filter((name) => !name.startsWith('_cf_')), ['login_limits', 'sessions']);

  function call(path, { method = 'GET', body, token, requestOrigin = origin } = {}) {
    const headers = { 'CF-Connecting-IP': '192.0.2.50' };
    if (requestOrigin !== null) headers.Origin = requestOrigin;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return mf.dispatchFetch(`https://csd-api.example${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  assert.equal((await call('/seminars', { method: 'POST' })).status, 401);
  const wrongPassword = await call('/auth/login', { method: 'POST', body: { role: 'seminars', password: 'incorrect' } });
  assert.equal(wrongPassword.status, 401);
  // No GitHub token or end-user GitHub identity is required to sign in.
  const signIn = await call('/auth/login', { method: 'POST', body: { role: 'seminars', password } });
  assert.equal(signIn.status, 200, await signIn.clone().text());
  const { token } = await signIn.json();
  assert.equal((await call('/auth/session', { token })).status, 200);
  assert.equal((await call('/auth/session', { token, requestOrigin: null })).status, 403);
  assert.equal((await call('/auth/session', { token: `${token}invalid` })).status, 401);
  assert.equal((await call('/seminars', { method: 'POST', token, body: { title: 'Incomplete submission' } })).status, 400);
  // Repository writing requires the administrator's server credential and fails closed without it.
  const missingServerCredential = await call('/seminars', { method: 'POST', token, body: {
    speaker: 'Jane Doe', institution: 'ENS', title: 'Runtime test seminar', date: '2027-01-15T11:00:00+01:00',
  } });
  assert.equal(missingServerCredential.status, 503);
  assert.equal((await call('/auth/logout', { method: 'POST', token })).status, 200);
  assert.equal((await call('/auth/session', { token })).status, 401);
});
