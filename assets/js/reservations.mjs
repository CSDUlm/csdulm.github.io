export const PARIS_ZONE = "Europe/Paris";
export const ROOMS = Object.freeze([
  { id: "meeting", label: { en: "Meeting room", fr: "Salle réunion" }, color: "#477668" },
  { id: "meeting-bis", label: { en: "Meeting room bis", fr: "Salle réunion bis" }, color: "#597ba3" },
  { id: "visio-cafe", label: { en: "Video room · café", fr: "Salle visio café" }, color: "#b07842" },
  { id: "visio-couloir", label: { en: "Video room · corridor", fr: "Salle visio couloir" }, color: "#8d699f" },
]);
export class ReservationError extends Error {
  constructor(code = "invalid") { super(code); this.name = "ReservationError"; this.code = code; }
}
const fail = (code = "invalid") => { throw new ReservationError(code); };
const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const parts = (instant) => Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
export const roomLabel = (id, lang = "en") => ROOMS.find(r => r.id === id)?.label[lang === "fr" ? "fr" : "en"] || id;
export function parisDate(instant = Date.now()) { const p = parts(instant); return `${p.year}-${p.month}-${p.day}`; }
export function toParisInput(instant) { const p = parts(instant); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
export function parisInputToISO(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) fail();
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) fail();
  const target = Date.UTC(year, month - 1, day, hour, minute), check = new Date(target);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) fail();
  const offsets = new Set();
  for (const h of [-36, -12, 0, 12, 36]) {
    const sample = target + h * 3600000, p = parts(sample);
    offsets.add(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - sample);
  }
  const candidates = [...offsets].map(o => target - o).filter(i => toParisInput(i) === value);
  if (!candidates.length) fail("missing-time");
  if (candidates.length > 1) fail("repeated-time");
  return new Date(candidates[0]).toISOString();
}
function dateInstant(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) fail();
  const i = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(i) || new Date(i).toISOString().slice(0, 10) !== day) fail();
  return i;
}
export function addDays(day, n) { return new Date(dateInstant(day) + n * 86400000).toISOString().slice(0, 10); }
export function startOfWeek(day) { return addDays(day, -((new Date(dateInstant(day)).getUTCDay() + 6) % 7)); }
export function monthDays(day) { const first = startOfWeek(`${day.slice(0, 7)}-01`); return Array.from({ length: 42 }, (_, i) => addDays(first, i)); }
export function formatDate(day, lang = "en", options = {}) { return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric", ...options }).format(dateInstant(day)); }
export function calendarParts(iso) { const p = parts(iso); return { day: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute }; }
function dayBounds(day) { return [Date.parse(parisInputToISO(`${day}T00:00`)), Date.parse(parisInputToISO(`${addDays(day, 1)}T00:00`))]; }
export function eventsForDay(bookings, day) { const [a, b] = dayBounds(day); return bookings.filter(x => Date.parse(x.start) < b && Date.parse(x.end) > a); }
export function segmentForDay(booking, day) {
  const [a, b] = dayBounds(day), start = Date.parse(booking.start), end = Date.parse(booking.end);
  return { startMinutes: start <= a ? 0 : calendarParts(booking.start).minute, endMinutes: end >= b ? 1440 : calendarParts(booking.end).minute, continuesBefore: start < a, continuesAfter: end > b };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail();
  const i = Date.parse(value);
  if (!Number.isFinite(i) || new Date(i).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) fail();
  return new Date(i).toISOString();
}
export function validateReservationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail();
  if (!ROOMS.some(r => r.id === input.room) || typeof input.title !== "string" || typeof input.people !== "string") fail();
  const title = input.title.trim(), people = input.people.trim();
  if (title.length > 120 || !people || people.length > 160 || /[\u0000-\u001f\u007f]/.test(title + people)) fail();
  const start = instant(input.start), end = instant(input.end), duration = Date.parse(end) - Date.parse(start);
  if (duration < 60000 || duration > 7 * 86400000) fail();
  // A wall-clock agenda cannot distinguish the two occurrences of an autumn hour.
  // Reject ambiguous endpoints consistently, including records written outside the UI.
  parisInputToISO(toParisInput(start));
  parisInputToISO(toParisInput(end));
  return { room: input.room, title, people, start, end };
}
export function assertNoOverlap(input, bookings, ignoreId) {
  if (bookings.some(b => b.id !== ignoreId && b.room === input.room && Date.parse(input.start) < Date.parse(b.end) && Date.parse(input.end) > Date.parse(b.start))) fail("overlap");
}
export function validateBookingsDocument(data) {
  try {
    if (!data || data.version !== 1 || data.timezone !== PARIS_ZONE || !Array.isArray(data.bookings) || data.bookings.length > 5000 || new TextEncoder().encode(JSON.stringify(data)).length > 950 * 1024) fail();
    const ids = new Set();
    const bookings = data.bookings.map(b => {
      if (!b || !UUID.test(b.id) || !UUID.test(b.revision) || ids.has(b.id)) fail();
      ids.add(b.id);
      const createdAt = instant(b.createdAt), updatedAt = instant(b.updatedAt);
      if (Date.parse(updatedAt) < Date.parse(createdAt)) fail();
      return { id: b.id, ...validateReservationInput(b), createdAt, updatedAt, revision: b.revision };
    }).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    const ends = new Map();
    for (const b of bookings) {
      if ((ends.get(b.room) || -Infinity) > Date.parse(b.start)) fail();
      ends.set(b.room, Date.parse(b.end));
    }
    return { version: 1, timezone: PARIS_ZONE, bookings };
  } catch { fail("invalid-data"); }
}
