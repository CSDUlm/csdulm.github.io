import test from "node:test";
import assert from "node:assert/strict";
import { createSetupDiagnostics } from "../scripts/booking-setup-diagnostics.mjs";

const repository = "https://api.github.com/repos/CSDUlm/csd-room-reservations";
const file = `${repository}/contents/bookings.json`;
const secret = "github_pat_SYNTHETIC_PRIVATE_SECRET_ONLY";
const response = status => new Response(JSON.stringify({ message: secret }), { status, headers: { "x-private-secret": secret } });

test("Setup diagnostics distinguish selected repository, read access and write access without revealing credentials", async () => {
  const cases = [
    [repository, "GET", 404, /Resource owner: CSDUlm.*Only select repositories: csd-room-reservations.*awaiting organisation approval/],
    [`${file}?ref=main`, "GET", 404, /bookings\.json exists on the main branch.*Contents access/],
    [file, "PUT", 403, /Contents permission to Read and write.*rules protecting the main branch/],
    [repository, "GET", 403, /approved for the organisation.*Organisation token policies/],
    [repository, "GET", 401, /invalid, expired or revoked/],
    [file, "PUT", 409, /Another update/],
    [file, "PUT", 422, /repository configuration/],
    [repository, "GET", 429, /limiting requests/],
    [repository, "GET", 503, /temporarily unavailable/],
  ];
  for (const [url, method, status, expected] of cases) {
    const diagnostics = createSetupDiagnostics(async () => response(status));
    const received = await diagnostics.fetch(url, { method, headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(received.status, status);
    assert.match(diagnostics.explain(), expected);
    assert.match(diagnostics.explain(), new RegExp(`HTTP ${status}`));
    assert.ok(!diagnostics.explain().includes(secret));
  }
});

test("Setup diagnostics preserve fetch arguments, response identity and abort signal", async () => {
  const controller = new AbortController();
  const options = { method: "PUT", signal: controller.signal, headers: { Authorization: `Bearer ${secret}` }, body: secret };
  const original = response(403);
  let calls = 0;
  const diagnostics = createSetupDiagnostics(async (url, received) => {
    calls++;
    assert.equal(url, file);
    assert.equal(received, options);
    assert.equal(received.signal, controller.signal);
    assert.equal(received.signal.aborted, true);
    return original;
  });
  controller.abort();
  assert.equal(await diagnostics.fetch(file, options), original);
  assert.equal(calls, 1);
  assert.equal(original.bodyUsed, false, "Diagnostics do not read response bodies");
  assert.equal(original.headers.get("x-private-secret"), secret, "The original response remains untouched");
});

test("Network exceptions produce fixed advice and are rethrown unchanged", async () => {
  const rawError = new Error(`Connection failed with token ${secret} at https://attacker.example/${secret}`);
  const diagnostics = createSetupDiagnostics(async () => { throw rawError; });
  await assert.rejects(diagnostics.fetch(repository, { method: "GET" }), error => error === rawError);
  assert.match(diagnostics.explain(), /connection to GitHub failed.*repository check/);
  assert.match(diagnostics.explain(), /proxy and TLS configuration/);
  assert.match(diagnostics.explain(), /Do not disable certificate verification/);
  assert.ok(!diagnostics.explain().includes(secret));
  assert.ok(!diagnostics.explain().includes("attacker"));
});

test("Only fixed endpoint and method combinations are inspected", async () => {
  const diagnostics = createSetupDiagnostics(async () => response(404));
  for (const [url, method] of [
    [`${file}?ref=main&token=${secret}`, "GET"],
    [repository, "POST"],
    [file, "GET"],
    [new URL(repository), "GET"],
    [`https://attacker.example/${secret}`, "PUT"],
  ]) {
    await diagnostics.fetch(url, { method });
    assert.equal(diagnostics.explain(), "");
  }
});

test("Successful retries clear earlier failures and diagnostics do not inspect response headers or bodies", async () => {
  let status = 409;
  const diagnostics = createSetupDiagnostics(async () => ({
    status,
    get headers() { throw new Error(secret); },
    get body() { throw new Error(secret); },
    text() { throw new Error(secret); },
  }));
  assert.equal(diagnostics.explain(), "");
  await diagnostics.fetch(file, { method: "PUT" });
  assert.match(diagnostics.explain(), /HTTP 409/);
  status = 200;
  await diagnostics.fetch(file, { method: "PUT" });
  assert.equal(diagnostics.explain(), "");
});
