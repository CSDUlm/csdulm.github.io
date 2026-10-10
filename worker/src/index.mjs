const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const SESSION_SECONDS = 30 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_BODY_BYTES = 16 * 1024;
// GitHub's JSON Contents response includes Base64 data only for files below 1 MB.
// Keep writes below that ceiling so every saved database remains readable.
const MAX_REPOSITORY_BYTES = 950 * 1024;
const ROLES = new Set(['seminars', 'bookings']);
const ROOMS = new Set(['reunion', 'reunion-bis', 'visio-cafe', 'visio-couloir']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function base64url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unbase64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const result = base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/'));
  if (base64url(result) !== value) throw new Error('Invalid encoding');
  return result;
}

export function parsePasswordHash(value) {
  if (typeof value !== 'string') throw new HttpError(503, 'The secure service is not configured.');
  const [algorithm, iterations, salt, digest, ...extra] = value.split('$');
  try {
    if (algorithm !== 'pbkdf2-sha256' || iterations !== '100000' || extra.length) throw new Error();
    const saltBytes = unbase64url(salt);
    const digestBytes = unbase64url(digest);
    if (saltBytes.length !== 16 || digestBytes.length !== 32) throw new Error();
    return { iterations: 100000, salt: saltBytes, digest: digestBytes };
  } catch {
    throw new HttpError(503, 'The secure service is not configured.');
  }
}

export async function verifyPassword(password, encodedHash) {
  const hash = parsePasswordHash(encodedHash);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hash.salt, iterations: hash.iterations }, key, 256,
  ));
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ hash.digest[index];
  return difference === 0;
}

function secretBytes(env) {
  if (typeof env.SESSION_SECRET !== 'string' || !/^[0-9a-f]{64}$/i.test(env.SESSION_SECRET)) {
    throw new HttpError(503, 'The secure service is not configured.');
  }
  return Uint8Array.from(env.SESSION_SECRET.match(/.{2}/g), (pair) => parseInt(pair, 16));
}

async function hmacKey(env) {
  return crypto.subtle.importKey('raw', secretBytes(env), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signSession(payload, env) {
  const message = `v1.${base64url(encoder.encode(JSON.stringify(payload)))}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env), encoder.encode(message));
  return `${message}.${base64url(new Uint8Array(signature))}`;
}

async function readSessionToken(token, env, nowSeconds) {
  const key = await hmacKey(env);
  try {
    if (typeof token !== 'string' || token.length > 2048) throw new Error();
    const [version, encoded, signature, ...extra] = token.split('.');
    if (version !== 'v1' || extra.length) throw new Error();
    const signatureBytes = unbase64url(signature);
    if (signatureBytes.length !== 32) throw new Error();
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(`${version}.${encoded}`));
    if (!valid) throw new Error();
    const payload = JSON.parse(decoder.decode(unbase64url(encoded)));
    if (payload.aud !== 'csd-private-api' || !UUID.test(payload.sub) || !ROLES.has(payload.role)
      || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)
      || payload.exp <= nowSeconds || payload.iat > nowSeconds + 30
      || payload.exp <= payload.iat || payload.exp - payload.iat > SESSION_SECONDS
      || typeof payload.origin !== 'string') throw new Error();
    return payload;
  } catch {
    throw new HttpError(401, 'Please sign in again. Your session is missing or has expired.');
  }
}

function allowedOrigins(env) {
  if (typeof env.ALLOWED_ORIGINS !== 'string' || !env.ALLOWED_ORIGINS.trim()) {
    throw new HttpError(503, 'The secure service is not configured.');
  }
  const origins = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new HttpError(503, 'The secure service is not configured.'); }
    const localDevelopment = env.ENVIRONMENT === 'development' && url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (origin !== url.origin || (!localDevelopment && url.protocol !== 'https:')) {
      throw new HttpError(503, 'The secure service is not configured.');
    }
  }
  return new Set(origins);
}

function requireOrigin(request, env, required = true) {
  const origin = request.headers.get('Origin');
  if ((!origin && required) || (origin && !allowedOrigins(env).has(origin))) {
    throw new HttpError(403, 'This website is not allowed to access the secure service.');
  }
  return origin;
}

function privateDatabase(env) {
  if (!env.DB?.prepare || !env.DB?.batch) throw new HttpError(503, 'The secure service is not configured.');
  // Start on the primary so a revoked session cannot be served from an old replica.
  return env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
}

function requireAuthConfig(env) {
  secretBytes(env);
  parsePasswordHash(env.SEMINAR_PASSWORD_HASH);
  parsePasswordHash(env.BOOKING_PASSWORD_HASH);
  return privateDatabase(env);
}

async function authorize(request, env, nowSeconds, requiredRole) {
  const origin = requireOrigin(request, env);
  const db = requireAuthConfig(env);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in to continue.');
  const session = await readSessionToken(authorization.slice(7), env, nowSeconds);
  if (session.origin !== origin || (requiredRole && session.role !== requiredRole)) {
    throw new HttpError(403, 'Your sign-in does not allow this action.');
  }
  const stored = await db.prepare(
    'SELECT id FROM sessions WHERE id = ? AND role = ? AND origin = ? AND expires_at = ? AND expires_at > ?',
  ).bind(session.sub, session.role, origin, session.exp, nowSeconds).first();
  if (!stored) throw new HttpError(401, 'Please sign in again. Your session is missing or has expired.');
  return { session, db };
}

async function readBoundedBody(response, limit) {
  const length = response.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw new HttpError(413, 'The submitted data is too large.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, 'The submitted data is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return decoder.decode(bytes);
}

async function bodyObject(request, allowedKeys) {
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Please submit JSON data.');
  }
  let body;
  try { body = JSON.parse(await readBoundedBody(request, MAX_BODY_BYTES)); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The submitted data is not valid JSON.');
  }
  if (!body || Array.isArray(body) || typeof body !== 'object'
    || Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw new HttpError(400, 'The submitted fields are not valid.');
  }
  return body;
}

function textField(value, name, maximum, { optional = false, multiline = false } = {}) {
  if (optional && (value === undefined || value === '')) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `Please enter ${name}.`);
  const text = value.normalize('NFC').trim();
  const forbidden = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (!text || text.length > maximum || forbidden.test(text)) {
    throw new HttpError(400, `${name} must contain between 1 and ${maximum} characters.`);
  }
  return text;
}

export function parseDateTime(value, name = 'The date and time') {
  const pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
  const match = typeof value === 'string' && value.length <= 40 && value.match(pattern);
  if (!match) throw new HttpError(400, `${name} must include an explicit timezone.`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const instant = Date.parse(value);
  if (year < 2000 || year > 2100 || calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(instant)) {
    throw new HttpError(400, `${name} is not a valid date and time.`);
  }
  return instant;
}

export function validateSeminar(body) {
  const seminar = {
    speaker: textField(body.speaker, 'the speaker’s name', 160),
    institution: textField(body.institution, 'the institution', 240),
    title: textField(body.title, 'the talk title', 500),
    date: new Date(parseDateTime(body.date, 'The seminar date')).toISOString(),
    room: textField(body.room === undefined || body.room === '' ? 'Room W' : body.room, 'the room', 120),
    timeKnown: true,
    roomKnown: true,
  };
  const abstract = textField(body.abstract, 'the abstract', 8000, { optional: true, multiline: true });
  if (abstract !== undefined) seminar.abstract = abstract;
  const url = textField(body.url, 'the talk URL', 500, { optional: true });
  if (url !== undefined) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new HttpError(400, 'The talk URL must be an HTTPS address.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new HttpError(400, 'The talk URL must be an HTTPS address.');
    }
    seminar.url = parsed.href;
  }
  return seminar;
}

export function validateReservation(body, nowMilliseconds) {
  if (!ROOMS.has(body.room)) throw new HttpError(400, 'Please choose one of the four available rooms.');
  const start = parseDateTime(body.start, 'The start time');
  const end = parseDateTime(body.end, 'The end time');
  if (end <= start || end - start > 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'A reservation must end after it starts and last at most 24 hours.');
  }
  if (start < nowMilliseconds - 5 * 60 * 1000 || start > nowMilliseconds + 366 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'Please choose a start time within the coming year.');
  }
  return { room: body.room, name: textField(body.name, 'the reserving person’s name', 120), start, end };
}

async function consumeLoginAttempt(request, env, db, role, nowSeconds) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip && env.ENVIRONMENT !== 'development') throw new HttpError(503, 'The secure service is temporarily unavailable.');
  const addressHash = base64url(new Uint8Array(await crypto.subtle.sign(
    'HMAC', await hmacKey(env), encoder.encode(`login-ip:${ip || 'local-development'}`),
  )));
  const window = Math.floor(nowSeconds / LOGIN_WINDOW_SECONDS) * LOGIN_WINDOW_SECONDS;
  const query = `INSERT INTO login_limits (key, window, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN login_limits.window = excluded.window THEN login_limits.attempts + 1 ELSE 1 END,
      window = excluded.window
    RETURNING attempts`;
  const throttle = () => {
    throw new HttpError(429, 'Too many sign-in attempts. Please try again in 15 minutes.',
      { 'Retry-After': String(window + LOGIN_WINDOW_SECONDS - nowSeconds) });
  };
  // An already-blocked IP must not consume the global budget and lock everyone out.
  // Each UPSERT is independently atomic even when login requests arrive concurrently.
  const ipCount = await db.prepare(query).bind(`ip:${role}:${addressHash}`, window).first();
  if (!Number.isInteger(ipCount?.attempts)) throw new Error('Rate limit unavailable');
  if (ipCount.attempts > 5) throttle();
  const globalCount = await db.prepare(query).bind(`global:${role}`, window).first();
  if (!Number.isInteger(globalCount?.attempts)) throw new Error('Rate limit unavailable');
  if (globalCount.attempts > 50) throttle();
}

function repositoryConfig(env, write = false) {
  const repository = env.GITHUB_REPOSITORY || 'CSDUlm/csdulm.github.io';
  const branch = env.GITHUB_BRANCH || 'main';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || typeof branch !== 'string'
    || !branch || branch.length > 120 || (write && !env.GITHUB_TOKEN)) {
    throw new HttpError(503, 'The seminar service is not configured.');
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CSD-seminar-manager',
    'Cache-Control': 'no-cache',
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return { branch, headers, url: `https://api.github.com/repos/${repository}/contents/data/seminars.json` };
}

async function readSeminars(env, fetchImpl) {
  const { branch, headers, url } = repositoryConfig(env);
  const response = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
  if (!response.ok) throw new HttpError(503, 'The seminar service is temporarily unavailable.');
  let file;
  let data;
  try {
    file = JSON.parse(await readBoundedBody(response, MAX_REPOSITORY_BYTES * 2));
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.sha !== 'string'
      || typeof file.content !== 'string' || file.size > MAX_REPOSITORY_BYTES) throw new Error();
    const bytes = base64ToBytes(file.content.replace(/\s/g, ''));
    if (bytes.byteLength > MAX_REPOSITORY_BYTES) throw new Error();
    data = JSON.parse(decoder.decode(bytes));
    if (data.version !== 1 || data.timezone !== 'Europe/Paris' || !Array.isArray(data.seminars)
      || data.seminars.length > 4000 || data.seminars.some((seminar) => !RECORD_ID.test(seminar.id))) throw new Error();
    if (new Set(data.seminars.map((seminar) => seminar.id)).size !== data.seminars.length) throw new Error();
  } catch {
    throw new HttpError(503, 'The seminar database could not be read.');
  }
  return { data, sha: file.sha };
}

async function updateSeminars(env, fetchImpl, modify, message) {
  const { branch, headers, url } = repositoryConfig(env, true);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await readSeminars(env, fetchImpl);
    modify(data);
    const serialized = encoder.encode(`${JSON.stringify(data, null, 2)}\n`);
    if (serialized.byteLength > MAX_REPOSITORY_BYTES || data.seminars.length > 4000) {
      throw new HttpError(413, 'The seminar database is full. Please contact the administrator.');
    }
    const response = await fetchImpl(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, branch, sha, content: bytesToBase64(serialized) }),
    });
    if (response.ok) return;
    // The old blob SHA makes the write conditional; reread and merge after a conflict.
    if (response.status !== 409 && response.status !== 422) {
      throw new HttpError(503, 'The seminar could not be saved. Please try again later.');
    }
  }
  throw new HttpError(409, 'Another seminar change was saved at the same time. Please try again.');
}

function reservationRow(row) {
  return { id: row.id, room: row.room, name: row.name,
    start: new Date(row.start_ms).toISOString(), end: new Date(row.end_ms).toISOString(), createdAt: row.created_at };
}

function responseHeaders(request, env, extra = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    Vary: 'Origin',
    ...extra,
  });
  const origin = request.headers.get('Origin');
  try {
    if (origin && allowedOrigins(env).has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  } catch { /* An invalid allowlist must never produce an permissive CORS response. */ }
  return headers;
}

export function createHandler({ fetch: fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  return async function handle(request, env) {
    const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data),
      { status, headers: responseHeaders(request, env, headers) });
    try {
      const url = new URL(request.url);
      const localDevelopment = env.ENVIRONMENT === 'development' && url.protocol === 'http:'
        && ['localhost', '127.0.0.1'].includes(url.hostname);
      if (url.protocol !== 'https:' && !localDevelopment) throw new HttpError(403, 'HTTPS is required.');
      if (url.pathname.length > 250 || url.search.length > 500) throw new HttpError(400, 'The request address is too long.');
      const path = url.pathname.replace(/\/$/, '') || '/';
      const method = request.method;
      const nowMilliseconds = now();
      const nowSeconds = Math.floor(nowMilliseconds / 1000);

      if (method === 'OPTIONS') {
        requireOrigin(request, env);
        const requestedMethod = request.headers.get('Access-Control-Request-Method');
        if (!['GET', 'POST', 'DELETE'].includes(requestedMethod)) throw new HttpError(405, 'This method is not supported.');
        const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
          .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
        if (requestedHeaders.some((header) => !['authorization', 'content-type'].includes(header))) {
          throw new HttpError(403, 'These request headers are not allowed.');
        }
        return new Response(null, { status: 204, headers: responseHeaders(request, env, {
          'Access-Control-Allow-Methods': 'GET, POST, DELETE',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
        }) });
      }

      if (path === '/auth/login' && method === 'POST') {
        const origin = requireOrigin(request, env);
        const db = requireAuthConfig(env);
        const body = await bodyObject(request, ['role', 'password']);
        if (!ROLES.has(body.role)) throw new HttpError(400, 'Please choose a valid sign-in role.');
        if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 256) {
          throw new HttpError(400, 'Please enter a valid password.');
        }
        await consumeLoginAttempt(request, env, db, body.role, nowSeconds);
        const passwordHash = body.role === 'seminars' ? env.SEMINAR_PASSWORD_HASH : env.BOOKING_PASSWORD_HASH;
        if (!await verifyPassword(body.password, passwordHash)) throw new HttpError(401, 'The password is incorrect.');
        const payload = { aud: 'csd-private-api', sub: crypto.randomUUID(), role: body.role,
          origin, iat: nowSeconds, exp: nowSeconds + SESSION_SECONDS };
        await db.prepare('INSERT INTO sessions (id, role, origin, expires_at) VALUES (?, ?, ?, ?)')
          .bind(payload.sub, payload.role, origin, payload.exp).run();
        return json({ token: await signSession(payload, env), role: payload.role,
          expiresAt: new Date(payload.exp * 1000).toISOString() });
      }

      if (path === '/auth/session' && method === 'GET') {
        const { session } = await authorize(request, env, nowSeconds);
        return json({ role: session.role, expiresAt: new Date(session.exp * 1000).toISOString() });
      }
      if (path === '/auth/logout' && method === 'POST') {
        const { session, db } = await authorize(request, env, nowSeconds);
        await db.prepare('DELETE FROM sessions WHERE id = ?').bind(session.sub).run();
        return json({ ok: true });
      }

      if (path === '/seminars' && method === 'GET') {
        requireOrigin(request, env, false);
        return json((await readSeminars(env, fetchImpl)).data);
      }
      if (path === '/seminars' && method === 'POST') {
        await authorize(request, env, nowSeconds, 'seminars');
        const seminar = { id: crypto.randomUUID(), ...validateSeminar(await bodyObject(request,
          ['speaker', 'institution', 'title', 'date', 'room', 'abstract', 'url'])) };
        await updateSeminars(env, fetchImpl, (data) => {
          data.seminars.push(seminar);
          data.seminars.sort((left, right) => left.date.localeCompare(right.date));
        }, `Add CSD seminar: ${seminar.speaker}`);
        return json({ seminar }, 201);
      }
      const seminarId = path.startsWith('/seminars/') ? path.slice('/seminars/'.length) : '';
      if (seminarId && method === 'DELETE') {
        await authorize(request, env, nowSeconds, 'seminars');
        if (!RECORD_ID.test(seminarId)) throw new HttpError(400, 'The seminar ID is not valid.');
        await updateSeminars(env, fetchImpl, (data) => {
          const index = data.seminars.findIndex((seminar) => seminar.id === seminarId);
          if (index < 0) throw new HttpError(404, 'This seminar could not be found.');
          data.seminars.splice(index, 1);
        }, `Remove CSD seminar: ${seminarId}`);
        return json({ ok: true });
      }

      if (path === '/reservations' && method === 'GET') {
        const { db } = await authorize(request, env, nowSeconds, 'bookings');
        const from = parseDateTime(url.searchParams.get('from'), 'The calendar start');
        const to = parseDateTime(url.searchParams.get('to'), 'The calendar end');
        if (to <= from || to - from > 93 * 24 * 60 * 60 * 1000) {
          throw new HttpError(400, 'Choose a calendar range of at most 93 days.');
        }
        const result = await db.prepare(
          'SELECT id, room, name, start_ms, end_ms, created_at FROM reservations WHERE start_ms < ? AND end_ms > ? ORDER BY start_ms, room LIMIT 1001',
        ).bind(to, from).all();
        if (result.results.length > 1000) throw new HttpError(422, 'There are too many reservations. Choose a shorter calendar range.');
        return json({ reservations: result.results.map(reservationRow) });
      }
      if (path === '/reservations' && method === 'POST') {
        const { db } = await authorize(request, env, nowSeconds, 'bookings');
        const reservation = validateReservation(await bodyObject(request, ['room', 'name', 'start', 'end']), nowMilliseconds);
        const row = { id: crypto.randomUUID(), room: reservation.room, name: reservation.name,
          start_ms: reservation.start, end_ms: reservation.end, created_at: new Date(nowMilliseconds).toISOString() };
        try {
          await db.prepare('INSERT INTO reservations (id, room, name, start_ms, end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(row.id, row.room, row.name, row.start_ms, row.end_ms, row.created_at).run();
        } catch (error) {
          if (String(error?.message).includes('reservation_overlap')) {
            throw new HttpError(409, 'This room is already reserved for part of that time. Please choose another time or room.');
          }
          throw error;
        }
        return json({ reservation: reservationRow(row) }, 201);
      }
      const reservationId = path.startsWith('/reservations/') ? path.slice('/reservations/'.length) : '';
      if (reservationId && method === 'DELETE') {
        const { db } = await authorize(request, env, nowSeconds, 'bookings');
        if (!UUID.test(reservationId)) throw new HttpError(400, 'The reservation ID is not valid.');
        const result = await db.prepare('DELETE FROM reservations WHERE id = ?').bind(reservationId).run();
        if (!result.meta?.changes) throw new HttpError(404, 'This reservation could not be found.');
        return json({ ok: true });
      }

      throw new HttpError(404, 'This endpoint could not be found.');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status, error.headers);
      // Never return database errors, request bodies, tokens, passwords, or provider responses.
      return json({ error: 'The secure service is temporarily unavailable. Please try again later.' }, 503);
    }
  };
}

export default {
  fetch: createHandler(),
  async scheduled(_controller, env) {
    const db = privateDatabase(env);
    const nowSeconds = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowSeconds),
      db.prepare('DELETE FROM login_limits WHERE window < ?').bind(nowSeconds - 24 * 60 * 60),
    ]);
  },
};
