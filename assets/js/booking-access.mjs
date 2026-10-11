import { PARIS_ZONE, ReservationError, validateReservationInput, validateBookingsDocument, assertNoOverlap } from "./reservations.mjs";

// Only this dedicated private repository can receive the decrypted credential.
export const BOOKING_REPOSITORY = "CSDUlm/csd-room-reservations";
const BRANCH = "main";
const PATH = "bookings.json";
const API = `https://api.github.com/repos/${BOOKING_REPOSITORY}`;
const FILE = `${API}/contents/${PATH}`;
const ITERATIONS = 600000;
const SESSION_MS = 30 * 60 * 1000;
const MAX_DATABASE_BYTES = 950 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^github_pat_[A-Za-z0-9_]{20,255}$/;
const fail = code => { throw new ReservationError(code); };

function base64(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(""));
}
function base64url(bytes) { return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unbase64url(value, length) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8192) fail("unconfigured");
  let bytes;
  try { bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); }
  catch { fail("unconfigured"); }
  if (base64url(bytes) !== value || (length !== undefined && bytes.length !== length)) fail("unconfigured");
  return bytes;
}
function parameters(envelope) {
  const keys = ["version", "configured", "algorithm", "kdf", "iterations", "salt", "iv", "ciphertext"];
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || Object.keys(envelope).length !== keys.length || keys.some(k => !Object.hasOwn(envelope, k)) || envelope.version !== 1 || envelope.configured !== true || envelope.algorithm !== "AES-256-GCM" || envelope.kdf !== "PBKDF2-SHA256" || envelope.iterations !== ITERATIONS) fail("unconfigured");
  const salt = unbase64url(envelope.salt, 16), iv = unbase64url(envelope.iv, 12), ciphertext = unbase64url(envelope.ciphertext);
  if (ciphertext.length < 32 || ciphertext.length > 4096) fail("unconfigured");
  const additionalData = encoder.encode(JSON.stringify({ purpose: "CSD room reservations", version: 1, algorithm: envelope.algorithm, kdf: envelope.kdf, iterations: envelope.iterations, salt: envelope.salt, iv: envelope.iv, repository: BOOKING_REPOSITORY, branch: BRANCH, path: PATH }));
  return { salt, iv, ciphertext, additionalData };
}
export function isConfiguredAccess(envelope) { try { parameters(envelope); return true; } catch { return false; } }

async function deriveKey(password, salt, cryptoImpl) {
  const bytes = encoder.encode(password);
  try {
    const key = await cryptoImpl.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveKey"]);
    return await cryptoImpl.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt }, key, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } finally { bytes.fill(0); }
}
function validatePayload(payload, now) {
  const keys = ["repository", "branch", "path", "token", "expiresAt"];
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== keys.length || keys.some(k => !Object.hasOwn(payload, k)) || payload.repository !== BOOKING_REPOSITORY || payload.branch !== BRANCH || payload.path !== PATH || typeof payload.token !== "string" || !TOKEN.test(payload.token) || typeof payload.expiresAt !== "string") fail("unconfigured");
  const expiry = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiry) || new Date(expiry).toISOString() !== payload.expiresAt) fail("unconfigured");
  if (expiry <= now) fail("expired");
  return expiry;
}

// Used only by the local setup tool and tests. The browser never seals credentials.
export async function sealBookingAccess(payload, password, { cryptoImpl = globalThis.crypto, now = Date.now } = {}) {
  validatePayload(payload, now());
  if (typeof password !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(password)) fail("invalid");
  if (!cryptoImpl?.subtle) fail("unavailable");
  const envelope = { version: 1, configured: true, algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: base64url(cryptoImpl.getRandomValues(new Uint8Array(16))), iv: base64url(cryptoImpl.getRandomValues(new Uint8Array(12))), ciphertext: base64url(new Uint8Array(32)) };
  const { salt, iv, additionalData } = parameters(envelope);
  const key = await deriveKey(password, salt, cryptoImpl);
  password = "";
  const bytes = encoder.encode(JSON.stringify(payload));
  try { envelope.ciphertext = base64url(new Uint8Array(await cryptoImpl.subtle.encrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, key, bytes))); }
  finally { bytes.fill(0); }
  return envelope;
}

export async function openBookingSession(envelope, password, { fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto, now = Date.now } = {}) {
  const { salt, iv, ciphertext, additionalData } = parameters(envelope);
  if (!cryptoImpl?.subtle || typeof fetchImpl !== "function") fail("unavailable");
  if (typeof password !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(password)) fail("wrong-password");
  let bytes;
  try {
    const key = await deriveKey(password, salt, cryptoImpl);
    password = "";
    bytes = new Uint8Array(await cryptoImpl.subtle.decrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, key, ciphertext));
  } catch { password = ""; fail("wrong-password"); }
  let payload;
  try { payload = JSON.parse(decoder.decode(bytes)); }
  catch { fail("unconfigured"); }
  finally { bytes.fill(0); }
  const tokenExpiry = validatePayload(payload, now());
  let token = payload.token;
  payload.token = "";
  payload = null;
  const deadline = Math.min(now() + SESSION_MS, tokenExpiry);
  const controllers = new Set();
  let closed = false, queue = Promise.resolve();
  const expiryTimer = setTimeout(() => close(), Math.max(0, deadline - now()));
  expiryTimer.unref?.();

  function close() {
    closed = true;
    token = "";
    clearTimeout(expiryTimer);
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }
  function active() { if (closed || now() >= deadline) { close(); fail("expired"); } }
  function serial(action) {
    const task = queue.then(() => { active(); return action(); });
    queue = task.catch(() => {});
    return task;
  }
  async function request(url, method = "GET", body) {
    active();
    // URL values are constants, never taken from the envelope or API response.
    if (![API, `${FILE}?ref=${BRANCH}`, FILE].includes(url)) fail("unavailable");
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetchImpl(url, { method, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal, redirect: "error", referrerPolicy: "no-referrer", credentials: "omit", cache: "no-store" });
      active();
      if (response.status === 401) { close(); fail("expired"); }
      if (response.status === 429 || (response.status === 403 && (response.headers?.get("x-ratelimit-remaining") === "0" || response.headers?.get("retry-after")))) fail("rate-limited");
      if (response.status === 409 && method === "PUT") return { conflict: true };
      if (!response.ok) fail(response.status === 422 ? "invalid" : "unavailable");
      if (Number(response.headers?.get("content-length")) > MAX_RESPONSE_BYTES) fail("invalid-data");
      const text = await response.text();
      active();
      if (encoder.encode(text).length > MAX_RESPONSE_BYTES) fail("invalid-data");
      try { return JSON.parse(text); } catch { fail("invalid-data"); }
    } catch (error) {
      if (error instanceof ReservationError) throw error;
      if (closed || now() >= deadline) { close(); fail("expired"); }
      fail("unavailable");
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  async function privateRepository() {
    const info = await request(API);
    if (!info || info.full_name !== BOOKING_REPOSITORY || info.private !== true || info.archived === true || info.disabled === true) { close(); fail("unavailable"); }
  }
  async function readDocument() {
    await privateRepository();
    const file = await request(`${FILE}?ref=${BRANCH}`);
    if (!file || file.type !== "file" || file.path !== PATH || file.encoding !== "base64" || !SHA.test(file.sha) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_DATABASE_BYTES || typeof file.content !== "string" || file.content.length > MAX_RESPONSE_BYTES) fail("invalid-data");
    let data, content;
    try {
      content = file.content.replace(/[\r\n]/g, "");
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) fail("invalid-data");
      const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
      if (bytes.length !== file.size || bytes.length > MAX_DATABASE_BYTES || base64(bytes) !== content) fail("invalid-data");
      data = JSON.parse(decoder.decode(bytes));
    } catch { fail("invalid-data"); }
    return { bookings: validateBookingsDocument(data).bookings, sha: file.sha, content };
  }
  async function read() {
    const { bookings, sha } = await readDocument();
    return { bookings, sha };
  }
  // Local setup proves the token can write without adding fictitious reservations.
  // Keep the original bytes: this must not normalize or rewrite existing bookings.
  async function verifyWriteAccess() {
    for (let attempt = 0; attempt <= 3; attempt++) {
      const { sha, content } = await readDocument();
      await privateRepository();
      const result = await request(FILE, "PUT", { message: "Verify room agenda access", branch: BRANCH, sha, content });
      if (!result || typeof result !== "object" || Array.isArray(result)) fail("invalid-data");
      if (result.conflict === true) continue;
      if (!SHA.test(result.content?.sha)) fail("invalid-data");
      return;
    }
    fail("conflict");
  }
  async function mutate(kind, id, revision, input) {
    if (kind !== "create" && (!UUID.test(id) || !UUID.test(revision))) fail("invalid");
    const normalized = kind === "remove" ? null : validateReservationInput(input);
    const createdId = kind === "create" ? cryptoImpl.randomUUID() : id;
    for (let attempt = 0; attempt <= 3; attempt++) {
      const { bookings, sha } = await read();
      const index = bookings.findIndex(b => b.id === id), previous = bookings[index];
      if (kind !== "create" && (!previous || previous.revision !== revision)) fail("conflict");
      const timestamp = new Date(Math.max(now(), previous ? Date.parse(previous.updatedAt) : 0)).toISOString();
      if (kind !== "remove") assertNoOverlap(normalized, bookings, kind === "update" ? id : undefined);
      const next = bookings.slice();
      if (kind === "remove") next.splice(index, 1);
      else {
        const booking = { id: createdId, ...normalized, createdAt: previous?.createdAt || timestamp, updatedAt: timestamp, revision: cryptoImpl.randomUUID() };
        if (kind === "create") next.push(booking); else next[index] = booking;
      }
      const database = validateBookingsDocument({ version: 1, timezone: PARIS_ZONE, bookings: next });
      const content = encoder.encode(`${JSON.stringify(database, null, 2)}\n`);
      if (content.length > MAX_DATABASE_BYTES) fail("invalid-data");
      await privateRepository();
      const result = await request(FILE, "PUT", { message: `Room reservation: ${kind}`, branch: BRANCH, sha, content: base64(content) });
      if (!result || typeof result !== "object" || Array.isArray(result)) fail("invalid-data");
      if (result.conflict === true) continue;
      if (!SHA.test(result.content?.sha)) fail("invalid-data");
      return { bookings: database.bookings, sha: result.content.sha };
    }
    fail("conflict");
  }
  return Object.freeze({
    read: () => serial(read),
    create: input => serial(() => mutate("create", null, null, input)),
    update: (id, revision, input) => serial(() => mutate("update", id, revision, input)),
    remove: (id, revision) => serial(() => mutate("remove", id, revision)),
    verifyWriteAccess: () => serial(verifyWriteAccess),
    close,
  });
}
