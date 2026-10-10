import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const origin = 'https://csdulm.github.io';
const password = 'runtime-only-booking-test-passphrase';
const salt = Buffer.alloc(16, 3);
const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url')}`;

test('Cloudflare workerd executes real D1 auth, concurrent reservation guard and logout', async (t) => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: fileURLToPath(new URL('../src/index.mjs', import.meta.url)),
    compatibilityDate: '2026-10-10',
    cf: false,
    d1Databases: { DB: '00000000-0000-0000-0000-000000000001' },
    bindings: {
      ENVIRONMENT: 'production', ALLOWED_ORIGINS: origin,
      SEMINAR_PASSWORD_HASH: hash, BOOKING_PASSWORD_HASH: hash, SESSION_SECRET: 'c3'.repeat(32),
    },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migration = readFileSync(new URL('../migrations/0001_private_api.sql', import.meta.url), 'utf8');
  // Keep trigger BEGIN/END bodies intact when creating the actual production schema.
  const statements = migration.replace(/^--.*$/gm, '').trim().split(/;\s*(?=CREATE)/);
  await db.batch(statements.map((statement) => db.prepare(statement.trim())));

  function call(path, { method = 'GET', body, token, requestOrigin = origin } = {}) {
    const headers = { 'CF-Connecting-IP': '192.0.2.50' };
    if (requestOrigin !== null) headers.Origin = requestOrigin;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return mf.dispatchFetch(`https://csd-api.example${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  const denied = await call('/reservations');
  assert.equal(denied.status, 401);
  const signIn = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password } });
  assert.equal(signIn.status, 200, await signIn.clone().text());
  const { token } = await signIn.json();
  assert.equal((await call('/auth/session', { token })).status, 200);
  assert.equal((await call('/auth/session', { token, requestOrigin: null })).status, 403);

  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
  const start = new Date(tomorrow).toISOString();
  const end = new Date(tomorrow + 60 * 60 * 1000).toISOString();
  const booking = { room: 'reunion', name: 'Runtime test booking', start, end };
  const concurrent = await Promise.all([
    call('/reservations', { method: 'POST', token, body: booking }),
    call('/reservations', { method: 'POST', token, body: booking }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);
  const { reservation } = await concurrent.find((response) => response.status === 201).json();
  const adjacent = await call('/reservations', { method: 'POST', token,
    body: { ...booking, start: end, end: new Date(tomorrow + 2 * 60 * 60 * 1000).toISOString() } });
  assert.equal(adjacent.status, 201);
  const from = encodeURIComponent(new Date(tomorrow - 60 * 60 * 1000).toISOString());
  const to = encodeURIComponent(new Date(tomorrow + 3 * 60 * 60 * 1000).toISOString());
  const calendar = await call(`/reservations?from=${from}&to=${to}`, { token });
  assert.equal(calendar.status, 200);
  assert.equal((await calendar.json()).reservations.length, 2);
  assert.equal((await call(`/reservations/${reservation.id}`, { method: 'DELETE', token })).status, 200);
  assert.equal((await call('/auth/logout', { method: 'POST', token })).status, 200);
  assert.equal((await call('/auth/session', { token })).status, 401);
});
