import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parisInputToISO, toParisInput, addDays, startOfWeek, monthDays, eventsForDay, segmentForDay, validateReservationInput, validateBookingsDocument, assertNoOverlap } from "../assets/js/reservations.mjs";
const input = { room: "meeting", title: "Research discussion", people: "CSD", start: "2026-10-11T09:00:00.000Z", end: "2026-10-11T10:00:00.000Z" };
const record = { ...input, id: "11111111-1111-4111-8111-111111111111", revision: "22222222-2222-4222-8222-222222222222", createdAt: "2026-10-10T10:00:00.000Z", updatedAt: "2026-10-10T10:00:00.000Z" };
test("unconfigured agenda fails closed even before its scripts initialize", () => {
  const html = readFileSync(new URL("../reservations/index.html", import.meta.url), "utf8");
  assert.match(html, /<form id="access-form" method="post"/);
  assert.match(html, /<input id="agenda-password"[^>]+disabled/);
  assert.match(html, /<button id="unlock-button"[^>]+disabled/);
  assert.match(html, /id="agenda-panel" hidden/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /noindex, nofollow/);
  const access = JSON.parse(readFileSync(new URL("../data/booking-access.json", import.meta.url)));
  assert.equal(typeof access.configured, "boolean");
  assert.ok(!Object.hasOwn(access, "password"));
  assert.ok(!Object.hasOwn(access, "token"));
});
test("Paris booking input handles winter, summer and daylight-saving ambiguity", () => {
  assert.equal(parisInputToISO("2026-01-11T11:00"), "2026-01-11T10:00:00.000Z");
  assert.equal(toParisInput(input.start), "2026-10-11T11:00");
  for (const value of ["2026-02-30T11:00", "2026-03-29T02:30", "2026-10-25T02:30"]) assert.throws(() => parisInputToISO(value));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(startOfWeek("2026-10-11"), "2026-10-05");
  assert.equal(monthDays("2026-10-11").length, 42);
  assert.throws(() => validateReservationInput({ ...input, start: "2026-10-25T00:45:00.000Z", end: "2026-10-25T01:15:00.000Z" }), { code: "repeated-time" });
  assert.ok(validateReservationInput({ ...input, start: "2026-10-24T23:00:00.000Z", end: "2026-10-25T03:00:00.000Z" }));
});
test("overlap checks cover containment and allow touching intervals in one room", () => {
  assert.throws(() => assertNoOverlap(input, [record]), { code: "overlap" });
  assert.throws(() => assertNoOverlap({ ...input, start: "2026-10-11T08:00:00.000Z", end: "2026-10-11T11:00:00.000Z" }, [record]), { code: "overlap" });
  assertNoOverlap({ ...input, start: input.end, end: "2026-10-11T11:00:00.000Z" }, [record]);
  assertNoOverlap({ ...input, room: "meeting-bis" }, [record]);
  assertNoOverlap(input, [record], record.id);
});
test("private booking documents reject corruption, duplicates, overlap and impossible dates", () => {
  const db = { version: 1, timezone: "Europe/Paris", bookings: [record] };
  assert.equal(validateBookingsDocument(db).bookings.length, 1);
  for (const b of [{ ...record, start: "2026-02-30T09:00:00Z" }, { ...record, people: "" }, { ...record, room: "unknown" }]) assert.throws(() => validateBookingsDocument({ ...db, bookings: [b] }), { code: "invalid-data" });
  assert.throws(() => validateBookingsDocument({ ...db, bookings: [record, record] }), { code: "invalid-data" });
  assert.throws(() => validateReservationInput({ ...input, end: input.start }));
});
test("multi-day bookings are clipped to the local calendar day", () => {
  const overnight = { ...record, start: "2026-10-10T21:00:00.000Z", end: "2026-10-11T06:00:00.000Z" };
  assert.equal(eventsForDay([overnight], "2026-10-11").length, 1);
  assert.deepEqual(segmentForDay(overnight, "2026-10-11"), { startMinutes: 0, endMinutes: 480, continuesBefore: true, continuesAfter: false });
  assert.equal(eventsForDay([overnight], "2026-10-12").length, 0);
});
