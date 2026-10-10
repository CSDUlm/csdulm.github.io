import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pbkdf2Sync } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { createHandler, parseDateTime, validateSeminar, validateReservation, verifyPassword } from '../src/index.mjs';

const migration = readFileSync(new URL('../migrations/0001_private_api.sql', import.meta.url), 'utf8');
const origin = 'https://csdulm.github.io';
const epoch = Date.parse('2026-10-10T08:00:00Z');
const seminarPassword = 'a-long-seminar-test-passphrase';
const bookingPassword = 'a-long-bookings-test-passphrase';
function passwordHash(password, saltByte) {
  const salt = Buffer.alloc(16, saltByte);
  return `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url')}`;
}
const seminarHash = passwordHash(seminarPassword, 1);
const bookingHash = passwordHash(bookingPassword, 2);

class SqliteD1 {
  constructor(path = ':memory:') {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec(migration);
  }
  withSession(constraint) {
    assert.equal(constraint, 'first-primary');
    return this;
  }
  prepare(query) {
    const sqlite = this.sqlite;
    let parameters = [];
    const statement = {
      bind(...values) { parameters = values; return statement; },
      async first() { return sqlite.prepare(query).get(...parameters) || null; },
      async all() { return { success: true, results: sqlite.prepare(query).all(...parameters) }; },
      async run() {
        if (/\bRETURNING\b/i.test(query)) return statement.all();
        const result = sqlite.prepare(query).run(...parameters);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
    };
    return statement;
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

function fixture(t, options = {}) {
  const db = new SqliteD1();
  t.after(() => db.sqlite.close());
  let time = epoch;
  const env = { DB: db, ENVIRONMENT: 'production', ALLOWED_ORIGINS: origin,
    SEMINAR_PASSWORD_HASH: seminarHash, BOOKING_PASSWORD_HASH: bookingHash,
    SESSION_SECRET: 'a1'.repeat(32), GITHUB_TOKEN: 'test-server-secret-token',
    GITHUB_REPOSITORY: 'CSDUlm/csdulm.github.io', GITHUB_BRANCH: 'main', ...options.env };
  const handle = createHandler({ now: () => time, fetch: options.fetch || (() => { throw new Error('Unexpected fetch'); }) });
  function call(path, { method = 'GET', body, token, requestOrigin = origin, headers = {} } = {}) {
    const requestHeaders = { 'CF-Connecting-IP': '192.0.2.5', ...headers };
    if (requestOrigin !== null) requestHeaders.Origin = requestOrigin;
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    return handle(new Request(`https://csd-api.example${path}`, {
      method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
  }
  async function login(role = 'bookings', password = bookingPassword, extra = {}) {
    const response = await call('/auth/login', { method: 'POST', body: { role, password }, ...extra });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  }
  return { call, login, env, db, handle, setTime: (value) => { time = value; } };
}

test('password verification checks the full salted hash and fails closed on unsupported hashes', async () => {
  assert.equal(await verifyPassword(bookingPassword, bookingHash), true);
  assert.equal(await verifyPassword('wrong-password', bookingHash), false);
  await assert.rejects(verifyPassword(bookingPassword, 'plaintext-password'));
  await assert.rejects(verifyPassword(bookingPassword, bookingHash.replace('$100000$', '$1$')));
});

test('all private reads/writes require sign-in and the correct role', async (t) => {
  const { call, login } = fixture(t);
  const paths = [
    ['/reservations?from=2026-10-10T00:00:00Z&to=2026-10-17T00:00:00Z', 'GET'],
    ['/reservations', 'POST'], ['/reservations/0c269130-bb73-4f3a-b7a9-55c2d0082f7d', 'DELETE'],
    ['/seminars', 'POST'], ['/seminars/archive-2024', 'DELETE'], ['/auth/session', 'GET'],
  ];
  for (const [path, method] of paths) assert.equal((await call(path, { method })).status, 401);
  const token = await login('seminars', seminarPassword);
  assert.equal((await call(paths[0][0], { token })).status, 403);
  assert.equal((await call('/reservations', { method: 'POST', token })).status, 403);
  const bookingToken = await login();
  assert.equal((await call('/seminars', { method: 'POST', token: bookingToken })).status, 403);
});

test('exact Origin matching rejects missing, null, lookalike, and foreign origins', async (t) => {
  const { call, login, env } = fixture(t);
  for (const requestOrigin of [null, 'null', 'https://csdulm.github.io.evil.example', 'https://evil.example']) {
    const response = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: bookingPassword }, requestOrigin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const token = await login();
  assert.equal((await call('/auth/session', { token, requestOrigin: null })).status, 403);
  env.ALLOWED_ORIGINS = `${origin},https://second.example`;
  assert.equal((await call('/auth/session', { token, requestOrigin: 'https://second.example' })).status, 403);
});

test('sessions expire, reject tampering, and are revoked immediately at logout', async (t) => {
  const { call, login, setTime } = fixture(t);
  const token = await login();
  const active = await call('/auth/session', { token });
  assert.equal(active.status, 200);
  assert.deepEqual(await active.json(), { role: 'bookings', expiresAt: '2026-10-10T08:30:00.000Z' });
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  payload.role = 'seminars';
  parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.equal((await call('/auth/session', { token: parts.join('.') })).status, 401);
  assert.equal((await call('/auth/session', { token: `${token}junk` })).status, 401);
  assert.equal((await call('/auth/session', { token: 'v1.invalid.invalid' })).status, 401);
  assert.equal((await call('/auth/logout', { method: 'POST', token })).status, 200);
  assert.equal((await call('/auth/session', { token })).status, 401);
  const laterToken = await login();
  setTime(epoch + 30 * 60 * 1000);
  assert.equal((await call('/auth/session', { token: laterToken })).status, 401);
});

test('durable login throttling counts attempts atomically and clears in the next window', async (t) => {
  const { call, setTime, db } = fixture(t);
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: 'wrong' } });
    assert.equal(response.status, 401);
  }
  const denied = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: bookingPassword } });
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Retry-After'), '900');
  const keys = db.sqlite.prepare('SELECT key FROM login_limits').all();
  assert.equal(keys.length, 2);
  assert.ok(keys.every(({ key }) => !key.includes('192.0.2.5')));
  setTime(epoch + 15 * 60 * 1000);
  assert.equal((await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: bookingPassword } })).status, 200);
});

test('D1 or authentication misconfiguration fails closed without exposing secrets', async (t) => {
  const { call, env } = fixture(t);
  for (const badValue of ['', 'plaintext', 'REPLACE_WITH_SECRET']) {
    env.SESSION_SECRET = badValue;
    const response = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: bookingPassword } });
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes(bookingPassword));
  }
  env.SESSION_SECRET = 'a1'.repeat(32);
  env.DB = { prepare() { throw new Error('Database SQL error with private details'); }, batch() { throw new Error('private database detail'); } };
  const failure = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: bookingPassword } });
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes('private database detail'));
  env.DB = null;
  assert.equal((await call('/reservations')).status, 503);
});

test('one blocked IP cannot exhaust the global login budget for other users', async (t) => {
  const { call, db } = fixture(t);
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: 'wrong' } });
    assert.equal(response.status, attempt < 5 ? 401 : 429);
  }
  assert.equal(db.sqlite.prepare("SELECT attempts FROM login_limits WHERE key = 'global:bookings'").get().attempts, 5);
  const legitimate = await call('/auth/login', { method: 'POST', body: { role: 'bookings', password: bookingPassword },
    headers: { 'CF-Connecting-IP': '192.0.2.6' } });
  assert.equal(legitimate.status, 200);
});

test('bounded JSON, strict field validation, real dates, safe links and default seminar room', async (t) => {
  const { call, login } = fixture(t);
  const token = await login();
  const oversized = await call('/reservations', { method: 'POST', token, body: { name: 'x'.repeat(20000) } });
  assert.equal(oversized.status, 413);
  const unknownField = await call('/reservations', { method: 'POST', token, body: { room: 'reunion', admin: true } });
  assert.equal(unknownField.status, 400);
  assert.throws(() => parseDateTime('2026-02-30T08:00:00Z'));
  assert.throws(() => parseDateTime('2026-10-10T08:00:00'));
  assert.throws(() => parseDateTime('2026-10-10T25:00:00Z'));
  const base = { speaker: 'Jane Doe', institution: 'ENS', title: 'A talk', date: '2026-10-11T11:00:00+02:00' };
  assert.equal(validateSeminar(base).room, 'Room W');
  assert.equal(validateSeminar(base).date, '2026-10-11T09:00:00.000Z');
  assert.throws(() => validateSeminar({ ...base, url: 'javascript:alert(1)' }));
  assert.throws(() => validateSeminar({ ...base, speaker: 'name\nforged' }));
  const reservation = { room: 'reunion', name: 'Ada', start: '2026-10-10T09:00:00Z', end: '2026-10-10T10:00:00Z' };
  assert.throws(() => validateReservation({ ...reservation, room: 'private-room' }, epoch));
  assert.throws(() => validateReservation({ ...reservation, end: reservation.start }, epoch));
  assert.throws(() => validateReservation({ ...reservation, end: '2026-10-12T10:00:00Z' }, epoch));
  assert.throws(() => validateReservation({ ...reservation, start: '2026-10-09T09:00:00Z' }, epoch));
});

test('private booking CRUD prevents overlaps, permits adjacent/different-room slots, and deletes', async (t) => {
  const { call, login } = fixture(t);
  const token = await login();
  const body = { room: 'reunion', name: 'Ada Lovelace', start: '2026-10-10T09:00:00Z', end: '2026-10-10T10:00:00Z' };
  const created = await call('/reservations', { method: 'POST', token, body });
  assert.equal(created.status, 201);
  const { reservation } = await created.json();
  assert.equal((await call('/reservations', { method: 'POST', token, body: { ...body, start: '2026-10-10T09:30:00Z' } })).status, 409);
  assert.equal((await call('/reservations', { method: 'POST', token, body: { ...body, start: '2026-10-10T10:00:00Z', end: '2026-10-10T11:00:00Z' } })).status, 201);
  assert.equal((await call('/reservations', { method: 'POST', token, body: { ...body, room: 'visio-cafe' } })).status, 201);
  const range = '/reservations?from=2026-10-10T00%3A00%3A00Z&to=2026-10-11T00%3A00%3A00Z';
  const list = await call(range, { token });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).reservations.length, 3);
  assert.equal(list.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await (await call(range)).text()).includes('Ada Lovelace'));
  assert.equal((await call(`/reservations/${reservation.id}`, { method: 'DELETE', token })).status, 200);
  assert.equal((await call(`/reservations/${reservation.id}`, { method: 'DELETE', token })).status, 404);
});

test('the actual SQLite trigger rejects simultaneous conflicting writes from two connections', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'csd-booking-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'private.sqlite');
  const setup = new DatabaseSync(file);
  setup.exec(migration);
  setup.close();
  const shared = new SharedArrayBuffer(4);
  const code = `const { workerData, parentPort } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(workerData.file);
    db.exec('PRAGMA busy_timeout = 5000');
    const signal = new Int32Array(workerData.shared);
    Atomics.add(signal, 0, 1); Atomics.notify(signal, 0);
    while (Atomics.load(signal, 0) < 2) Atomics.wait(signal, 0, 1, 1000);
    try {
      db.prepare('INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?)').run(workerData.id,
        'reunion', 'Concurrent booking', 1000, 2000, '2026-10-10T00:00:00Z');
      parentPort.postMessage('inserted');
    } catch (error) { parentPort.postMessage(error.message); }
    db.close();`;
  const run = (id) => new Promise((resolve, reject) => {
    const worker = new Worker(code, { eval: true, workerData: { file, shared, id } });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
  const results = await Promise.all([run('first'), run('second')]);
  assert.equal(results.filter((result) => result === 'inserted').length, 1);
  assert.equal(results.filter((result) => result.includes('reservation_overlap')).length, 1);
  const read = new DatabaseSync(file);
  assert.equal(read.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 1);
  read.close();
});

test('GitHub writes merge on SHA conflict and preserve imported unknown times and metadata', async (t) => {
  let document = { version: 1, timezone: 'Europe/Paris', sources: ['old website'], seminars: [
    { id: 'historical-2024', speaker: 'Historical speaker', institution: 'ENS', title: 'Historical talk',
      date: '2024-06-01', timeKnown: false, room: null, roomKnown: false, source: 'https://csd.ens.psl.eu/' },
  ] };
  let sha = 'original-sha';
  let conflict = true;
  let writes = 0;
  const provider = async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/repos/CSDUlm/csdulm.github.io/contents/data/seminars.json'));
    assert.equal(options.headers.Authorization, 'Bearer test-server-secret-token');
    if (options.method !== 'PUT') return Response.json({ type: 'file', encoding: 'base64', sha,
      size: JSON.stringify(document).length, content: Buffer.from(JSON.stringify(document)).toString('base64') });
    writes++;
    const update = JSON.parse(options.body);
    assert.equal(update.branch, 'main');
    if (conflict) {
      conflict = false;
      document.seminars.push({ id: 'another-added-record', date: '2026-10-12T09:00:00Z' });
      sha = 'another-sha';
      return Response.json({ message: 'SHA conflict' }, { status: 409 });
    }
    assert.equal(update.sha, sha);
    document = JSON.parse(Buffer.from(update.content, 'base64').toString());
    sha = `saved-${writes}`;
    return Response.json({ commit: { sha: 'commit' } });
  };
  const { call, login } = fixture(t, { fetch: provider });
  const publicResponse = await call('/seminars', { requestOrigin: null });
  assert.equal(publicResponse.status, 200);
  const publicText = await publicResponse.text();
  assert.ok(!publicText.includes('test-server-secret-token'));
  const token = await login('seminars', seminarPassword);
  const saved = await call('/seminars', { method: 'POST', token, body: {
    speaker: 'Jane Doe', institution: 'ENS', title: 'New seminar', date: '2026-10-11T11:00:00+02:00',
  } });
  assert.equal(saved.status, 201);
  assert.equal(writes, 2);
  assert.equal(document.seminars.length, 3);
  assert.deepEqual(document.sources, ['old website']);
  const historical = document.seminars.find((seminar) => seminar.id === 'historical-2024');
  assert.equal(historical.date, '2024-06-01');
  assert.equal(historical.room, null);
  assert.equal(historical.timeKnown, false);
  assert.equal(historical.source, 'https://csd.ens.psl.eu/');
  const { seminar } = await saved.json();
  assert.equal(seminar.room, 'Room W');
  assert.equal((await call(`/seminars/${seminar.id}`, { method: 'DELETE', token })).status, 200);
  assert.equal(document.seminars.length, 2);
});

test('CORS only permits the configured origin, methods and headers and sets no persistent cookies', async (t) => {
  const { call, login } = fixture(t);
  const allowed = await call('/reservations', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type',
  } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await call('/reservations', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-forged-header',
  } })).status, 403);
  assert.equal((await call('/reservations', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'PATCH',
  } })).status, 405);
  const token = await login();
  const session = await call('/auth/session', { token });
  assert.equal(session.headers.get('Set-Cookie'), null);
  assert.equal(session.headers.get('Cache-Control'), 'no-store');
  assert.equal(session.headers.get('X-Content-Type-Options'), 'nosniff');
});
