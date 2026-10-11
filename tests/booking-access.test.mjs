import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { BOOKING_REPOSITORY, isConfiguredAccess, sealBookingAccess, openBookingSession } from "../assets/js/booking-access.mjs";

// These are synthetic test credentials and never authorize a real repository.
const PASSWORD = randomBytes(24).toString("base64url");
const TOKEN = `github_pat_${"fakeFixtureOnly".repeat(4)}`;
const PAYLOAD = { repository: BOOKING_REPOSITORY, branch: "main", path: "bookings.json", token: TOKEN, expiresAt: "2030-01-01T00:00:00.000Z" };
const ENVELOPE = await sealBookingAccess(PAYLOAD, PASSWORD);
const EMPTY = { version: 1, timezone: "Europe/Paris", bookings: [] };
const input = (overrides = {}) => ({ room: "meeting", title: "Discussion", people: "Alice & Émilie", start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:00:00.000Z", ...overrides });
const record = (overrides = {}) => ({ id: "10000000-0000-4000-8000-000000000001", ...input(), createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z", revision: "10000000-0000-4000-8000-000000000002", ...overrides });
const code = expected => error => error.code === expected && error.message === expected;
const json = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function backend(initial = EMPTY) {
  let database = structuredClone(initial), privateRepo = true, counter = 0;
  const calls = [];
  const state = {
    calls,
    beforePut: null,
    override: null,
    get database() { return database; },
    set database(value) { database = structuredClone(value); counter++; },
    set private(value) { privateRepo = value; },
    sha: () => createHash("sha1").update(JSON.stringify(database) + counter).digest("hex"),
    async fetch(url, options) {
      calls.push({ url, options });
      assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
      assert.equal(options.redirect, "error");
      assert.equal(options.referrerPolicy, "no-referrer");
      assert.equal(options.credentials, "omit");
      assert.equal(options.cache, "no-store");
      assert.ok([`https://api.github.com/repos/${BOOKING_REPOSITORY}`, `https://api.github.com/repos/${BOOKING_REPOSITORY}/contents/bookings.json?ref=main`, `https://api.github.com/repos/${BOOKING_REPOSITORY}/contents/bookings.json`].includes(url));
      if (state.override) {
        const response = await state.override(url, options);
        if (response) return response;
      }
      if (url.endsWith(`/repos/${BOOKING_REPOSITORY}`)) return json({ full_name: BOOKING_REPOSITORY, private: privateRepo, archived: false });
      if (options.method === "GET") {
        const bytes = Buffer.from(JSON.stringify(database));
        return json({ type: "file", path: "bookings.json", encoding: "base64", size: bytes.length, content: bytes.toString("base64"), sha: state.sha() });
      }
      assert.equal(options.method, "PUT");
      if (state.beforePut) {
        const hook = state.beforePut;
        state.beforePut = null;
        await hook(state);
      }
      const body = JSON.parse(options.body);
      assert.equal(body.branch, "main");
      assert.ok(!body.message.includes("Alice"), "Commit messages do not copy booking names");
      if (body.sha !== state.sha()) return json({ message: "Concurrent update" }, 409);
      database = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
      counter++;
      return json({ content: { sha: state.sha() } });
    },
  };
  return state;
}
const session = state => openBookingSession(ENVELOPE, PASSWORD, { fetchImpl: state.fetch });

test("Encrypted access authenticates metadata and never contains plaintext credentials", async () => {
  assert.ok(isConfiguredAccess(ENVELOPE));
  const serialized = JSON.stringify(ENVELOPE);
  assert.ok(!serialized.includes(TOKEN) && !serialized.includes(PASSWORD));
  assert.equal(ENVELOPE.iterations, 600000);
  assert.equal(Buffer.from(ENVELOPE.salt, "base64url").length, 16);
  assert.equal(Buffer.from(ENVELOPE.iv, "base64url").length, 12);
  const second = await sealBookingAccess(PAYLOAD, PASSWORD);
  assert.notEqual(second.salt, ENVELOPE.salt);
  assert.notEqual(second.iv, ENVELOPE.iv);
  assert.notEqual(second.ciphertext, ENVELOPE.ciphertext);
  await assert.rejects(openBookingSession(ENVELOPE, randomBytes(24).toString("base64url")), code("wrong-password"));
  const altered = Buffer.from(ENVELOPE.ciphertext, "base64url");
  altered[0] ^= 1;
  await assert.rejects(openBookingSession({ ...ENVELOPE, ciphertext: altered.toString("base64url") }, PASSWORD), code("wrong-password"));
  const salt = randomBytes(16).toString("base64url");
  await assert.rejects(openBookingSession({ ...ENVELOPE, salt }, PASSWORD), code("wrong-password"));
});

test("Unconfigured or altered cryptographic settings do not initiate network requests", async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error("Should never fetch"); };
  for (const envelope of [{ version: 1, configured: false }, { ...ENVELOPE, iterations: 1 }, { ...ENVELOPE, iv: "short" }, { ...ENVELOPE, repository: "CSDUlm/csdulm.github.io" }, { ...ENVELOPE, kdf: "different" }, { ...ENVELOPE, ciphertext: "!" }]) {
    assert.equal(isConfiguredAccess(envelope), false);
    await assert.rejects(openBookingSession(envelope, PASSWORD, { fetchImpl }), code("unconfigured"));
  }
  assert.equal(calls, 0);
});

test("Sealing rejects the website, external destinations, broad tokens, and expired credentials", async () => {
  for (const patch of [{ repository: "CSDUlm/csdulm.github.io" }, { repository: "attacker/repo" }, { branch: "other" }, { path: "../bookings.json" }, { token: "ghp_aClassicBroadTokenShouldNeverBeShared" }]) {
    await assert.rejects(sealBookingAccess({ ...PAYLOAD, ...patch }, PASSWORD), code("unconfigured"));
  }
  await assert.rejects(sealBookingAccess({ ...PAYLOAD, expiresAt: "2020-01-01T00:00:00.000Z" }, PASSWORD), code("expired"));
});

test("Private repository verification precedes data reads and blocks publicly visible repositories", async () => {
  const state = backend();
  const client = await session(state);
  try {
    assert.deepEqual((await client.read()).bookings, []);
    assert.equal(state.calls[0].url, `https://api.github.com/repos/${BOOKING_REPOSITORY}`);
    state.private = false;
    const before = state.calls.length;
    await assert.rejects(client.create(input()), code("unavailable"));
    assert.equal(state.calls.length, before + 1, "No private data is requested or written after the visibility check fails");
    await assert.rejects(client.read(), code("expired"));
  } finally { client.close(); }
});

test("Malformed, missing, oversized, or non-UTF-8 databases cannot be overwritten", async () => {
  const broken = [
    json({ message: "Missing" }, 404),
    json({ type: "file", path: "bookings.json", encoding: "base64", size: 1, content: "/w==", sha: "a".repeat(40) }),
    json({ type: "file", path: "bookings.json", encoding: "none", size: 951 * 1024, content: "", sha: "a".repeat(40) }),
    json({ type: "file", path: "bookings.json", encoding: "base64", size: 2, content: "%%%%", sha: "a".repeat(40) }),
  ];
  for (const response of broken) {
    const state = backend();
    state.override = url => url.includes("/contents/") ? response : null;
    const client = await session(state);
    try { await assert.rejects(client.create(input()), code(response.status === 404 ? "unavailable" : "invalid-data")); }
    finally { client.close(); }
    assert.ok(!state.calls.some(c => c.options.method === "PUT"));
  }
  const state = backend({ ...EMPTY, bookings: [{ invalid: true }] });
  const client = await session(state);
  try { await assert.rejects(client.remove(record().id, record().revision), code("invalid-data")); }
  finally { client.close(); }
});

test("Create, update, and delete preserve UTF-8 names and rotate revisions with conditional writes", async () => {
  const state = backend();
  const client = await session(state);
  try {
    const created = await client.create(input());
    const original = created.bookings[0];
    assert.equal(original.people, "Alice & Émilie");
    assert.match(original.id, /^[0-9a-f-]{36}$/);
    const edited = await client.update(original.id, original.revision, input({ title: "Updated discussion" }));
    assert.equal(edited.bookings[0].id, original.id);
    assert.equal(edited.bookings[0].createdAt, original.createdAt);
    assert.notEqual(edited.bookings[0].revision, original.revision);
    const deleted = await client.remove(original.id, edited.bookings[0].revision);
    assert.deepEqual(deleted.bookings, []);
    assert.ok(state.calls.filter(c => c.options.method === "PUT").every(c => /^[0-9a-f]{40}$/.test(JSON.parse(c.options.body).sha)));
  } finally { client.close(); }
});

test("Setup verifies real write permission while preserving the exact original database bytes", async () => {
  const initial = { ...EMPTY, bookings: [record()], operatorNote: "Keep this metadata" };
  const original = `${JSON.stringify(initial, null, 4)}\n\n`;
  const state = backend(initial);
  state.override = (_url, options) => options.method === "GET" && _url.includes("/contents/") ? json({ type: "file", path: "bookings.json", encoding: "base64", size: Buffer.byteLength(original), content: Buffer.from(original).toString("base64"), sha: state.sha() }) : null;
  const client = await session(state);
  try {
    await client.verifyWriteAccess();
    const body = JSON.parse(state.calls.find(c => c.options.method === "PUT").options.body);
    assert.equal(Buffer.from(body.content, "base64").toString("utf8"), original);
    assert.equal(body.message, "Verify room agenda access");
    assert.deepEqual(state.database, initial);
  } finally { client.close(); }
  const readonly = backend();
  readonly.override = (_url, options) => options.method === "PUT" ? json({ message: "Resource not accessible by token" }, 403) : null;
  const reader = await session(readonly);
  try { await assert.rejects(reader.verifyWriteAccess(), code("unavailable")); }
  finally { reader.close(); }
});

test("Setup write verification retries a concurrent change without restoring older file contents", async () => {
  const state = backend();
  const concurrent = { ...EMPTY, bookings: [record()] };
  state.beforePut = state => { state.database = concurrent; };
  const client = await session(state);
  try {
    await client.verifyWriteAccess();
    assert.deepEqual(state.database, concurrent);
    assert.equal(state.calls.filter(c => c.options.method === "PUT").length, 2);
  } finally { client.close(); }
});

test("Stale edits and deletes never overwrite another holder's change", async () => {
  const original = record();
  const state = backend({ ...EMPTY, bookings: [original] });
  const client = await session(state);
  try {
    state.database = { ...EMPTY, bookings: [record({ revision: "10000000-0000-4000-8000-000000000003", title: "Someone else's edit" })] };
    await assert.rejects(client.update(original.id, original.revision, input()), code("conflict"));
    await assert.rejects(client.remove(original.id, original.revision), code("conflict"));
    assert.equal(state.database.bookings[0].title, "Someone else's edit");
    assert.ok(!state.calls.some(c => c.options.method === "PUT"));
  } finally { client.close(); }
});

test("A GitHub SHA race refetches the database and preserves unrelated bookings", async () => {
  const state = backend();
  state.beforePut = state => { state.database = { ...EMPTY, bookings: [record({ room: "meeting-bis" })] }; };
  const client = await session(state);
  try {
    const result = await client.create(input());
    assert.equal(result.bookings.length, 2);
    assert.deepEqual(result.bookings.map(b => b.room).sort(), ["meeting", "meeting-bis"]);
    assert.equal(state.calls.filter(c => c.options.method === "PUT").length, 2);
  } finally { client.close(); }
});

test("A concurrent overlapping booking is detected after a SHA conflict and is never replaced", async () => {
  const state = backend();
  state.beforePut = state => { state.database = { ...EMPTY, bookings: [record({ people: "Concurrent booker" })] }; };
  const client = await session(state);
  try {
    await assert.rejects(client.create(input()), code("overlap"));
    assert.equal(state.database.bookings.length, 1);
    assert.equal(state.database.bookings[0].people, "Concurrent booker");
    assert.equal(state.calls.filter(c => c.options.method === "PUT").length, 1);
  } finally { client.close(); }
});

test("Repeated SHA races stop after three retries", async () => {
  const state = backend();
  state.override = (_url, options) => options.method === "PUT" ? json({ message: "Race" }, 409) : null;
  const client = await session(state);
  try {
    await assert.rejects(client.create(input()), code("conflict"));
    assert.equal(state.calls.filter(c => c.options.method === "PUT").length, 4);
  } finally { client.close(); }
});

test("Malformed successful write responses produce a safe data error", async () => {
  for (const result of [null, [], "invalid", { content: null }]) {
    const state = backend();
    state.override = (_url, options) => options.method === "PUT" ? json(result) : null;
    const client = await session(state);
    try { await assert.rejects(client.create(input()), code("invalid-data")); }
    finally { client.close(); }
  }
});

test("Token revocation closes the session and never exposes GitHub's error body", async () => {
  const state = backend();
  state.override = () => json({ message: `Bad credential: ${TOKEN}` }, 401);
  const client = await session(state);
  try {
    await assert.rejects(client.read(), error => error.code === "expired" && !error.message.includes(TOKEN));
    const requests = state.calls.length;
    await assert.rejects(client.read(), code("expired"));
    assert.equal(state.calls.length, requests);
  } finally { client.close(); }
});

test("Rate limits produce a generic retriable message without losing the session", async () => {
  const state = backend();
  state.override = () => json({ message: `Token ${TOKEN} blocked` }, 403, { "x-ratelimit-remaining": "0" });
  const client = await session(state);
  try {
    await assert.rejects(client.read(), code("rate-limited"));
    state.override = null;
    assert.deepEqual((await client.read()).bookings, []);
  } finally { client.close(); }
});

test("Memory-only sessions close after thirty minutes or explicitly, before making another request", async () => {
  const state = backend();
  let clock = Date.now();
  const client = await openBookingSession(ENVELOPE, PASSWORD, { fetchImpl: state.fetch, now: () => clock });
  await client.read();
  const count = state.calls.length;
  clock += 30 * 60 * 1000;
  await assert.rejects(client.read(), code("expired"));
  assert.equal(state.calls.length, count);
  client.close();
  const second = await session(state);
  second.close();
  await assert.rejects(second.create(input()), code("expired"));
  assert.equal(state.calls.length, count);
});

test("Closing a session aborts in-flight API requests and suppresses late data", async () => {
  const state = backend();
  let signal, started;
  const pending = new Promise(resolve => { started = resolve; });
  state.override = (_url, options) => new Promise(resolve => {
    signal = options.signal;
    started();
    signal.addEventListener("abort", () => resolve(json({ full_name: BOOKING_REPOSITORY, private: true })));
  });
  const client = await session(state);
  const reading = client.read();
  await pending;
  client.close();
  await assert.rejects(reading, code("expired"));
  assert.equal(signal.aborted, true);
});

test("Browser access code stores no credential or booking data in persistent browser storage", () => {
  const source = readFileSync(new URL("../assets/js/booking-access.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
  const setup = readFileSync(new URL("../scripts/setup-bookings.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(setup, /process\.env|auth token|execSync|spawnSync/);
});
