import {
  ROOMS, PARIS_ZONE, roomLabel, parisDate, toParisInput, parisInputToISO,
  addDays, startOfWeek, monthDays, formatDate, calendarParts,
  eventsForDay, segmentForDay, validateReservationInput, assertNoOverlap,
} from "./reservations.mjs";
import { isConfiguredAccess, openBookingSession } from "./booking-access.mjs";
import { strings } from "./reservations-strings.mjs";

const lang = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const t = strings[lang], $ = (id) => document.getElementById(id);
const sessionLimit = 30 * 60 * 1000;
const state = {
  day: parisDate(), miniDay: parisDate(), view: "week", rooms: new Set(ROOMS.map(r => r.id)),
  weekends: true, fullDay: false, search: "", bookings: [], client: null,
  envelope: null, busy: false, refreshing: false, editing: null, expiry: null,
  generation: 0, dataGeneration: 0, dragged: null, suppressClickUntil: 0,
};
let sessionTimer, refreshTimer;

function node(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== "") el.textContent = text;
  return el;
}
function button(className, text, action, label = text) {
  const el = node("button", className, text); el.type = "button";
  if (label) el.setAttribute("aria-label", label);
  el.addEventListener("click", action); return el;
}
function roomStyle(el, room) {
  const color = ROOMS.find(r => r.id === room)?.color || ROOMS[0].color;
  el.style.setProperty("--room-color", color);
  el.style.setProperty("--room-tint", `color-mix(in srgb, ${color} 16%, white)`);
}
function timeText(minute) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }
function localInput(day, minute) {
  const days = Math.floor(minute / 1440), m = ((minute % 1440) + 1440) % 1440;
  return `${addDays(day, days)}T${timeText(m)}`;
}
function isoAt(day, minute) { return parisInputToISO(localInput(day, minute)); }
function moveMonth(day, direction) {
  const date = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}
function minuteNow() { return calendarParts(new Date().toISOString()).minute; }
function shortDate(day) { return formatDate(day, lang, { day: "numeric", month: "short", year: undefined }); }
function monthText(day) { return formatDate(day, lang, { day: undefined, month: "long", year: "numeric" }); }
function weekday(day, length = "short") { return formatDate(day, lang, { weekday: length, day: undefined, month: undefined, year: undefined }); }
function eventTime(booking, day) {
  const segment = segmentForDay(booking, day);
  return `${segment.continuesBefore ? "← " : ""}${timeText(segment.startMinutes)}–${timeText(segment.endMinutes)}${segment.continuesAfter ? " →" : ""}`;
}
function errorText(error) {
  return ({
    "wrong-password": t.wrongPassword, unconfigured: t.accessUnavailable,
    unavailable: t.unavailable, expired: t.expired, conflict: t.conflict,
    overlap: t.overlap, invalid: t.invalid, "rate-limited": t.rateLimited,
    "invalid-data": t.invalidData, "missing-time": t.ambiguousTime,
    "repeated-time": t.ambiguousTime,
  })[error?.code] || t.unavailable;
}
function notice(message, error = false, target = "agenda-status") {
  const el = $(target); el.textContent = message;
  el.classList.toggle("is-error", error); el.hidden = !message;
}
function isCurrent(client, generation) { return state.client === client && state.generation === generation; }
function setBusy(busy) {
  state.busy = busy;
  $("save-reservation").disabled = busy;
  $("delete-reservation").disabled = busy;
  $("confirm-delete").disabled = busy;
  $("new-reservation").disabled = busy;
  $("refresh-button").disabled = busy;
  $("reservation-form").querySelectorAll("input, select").forEach(el => { el.disabled = busy; });
  $("close-dialog").disabled = busy; $("cancel-dialog").disabled = busy;
}
function clearForm() {
  $("reservation-form").reset(); state.editing = null;
  $("delete-confirmation").hidden = true;
  $("dialog-summary").hidden = true;
  delete $("dialog-summary").dataset.stale;
  notice("", false, "dialog-status");
  $("reservation-duration").textContent = "";
}
function closeEditor() {
  if (state.busy) return;
  $("reservation-dialog").close(); clearForm();
}
function lock(message = t.lockDone) {
  const hadDraft = $("reservation-dialog").open;
  state.generation++;
  state.client?.close(); state.client = null; state.bookings = [];
  state.expiry = null; state.dragged = null; state.search = "";
  clearTimeout(sessionTimer); clearInterval(refreshTimer);
  $("reservation-dialog").close(); clearForm(); setBusy(false);
  $("calendar").replaceChildren(); $("reservation-count").textContent = "";
  $("last-refreshed").textContent = ""; $("agenda-search").value = "";
  $("agenda-panel").hidden = true; $("access-panel").hidden = false;
  $("agenda-password").value = "";
  $("agenda-password").disabled = !isConfiguredAccess(state.envelope);
  $("unlock-button").disabled = !isConfiguredAccess(state.envelope);
  $("access-status").textContent = message === t.expired && hadDraft ? t.expiredDraft : message;
  notice("");
}

function setupLanguage() {
  document.documentElement.lang = lang;
  document.title = `${t.pageTitle} — CSD, ENS Ulm`;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const value = t[el.dataset.i18n]; if (typeof value === "string") el.textContent = value;
  });
  $("language-switch").textContent = lang === "fr" ? "English" : "Français";
  $("language-switch").lang = lang === "fr" ? "en" : "fr";
  $("language-switch").href = lang === "fr" ? "?lang=en" : "?lang=fr";
  $("agenda-search").placeholder = t.searchPlaceholder;
  $("mini-prev").setAttribute("aria-label", t.previousMonth);
  $("mini-next").setAttribute("aria-label", t.nextMonth);
  $("previous-button").setAttribute("aria-label", t.previousPeriod);
  $("next-button").setAttribute("aria-label", t.nextPeriod);
  $("close-dialog").setAttribute("aria-label", t.close);
  document.querySelector(".agenda-sidebar").setAttribute("aria-label", t.calendarOptions);
  document.querySelector(".agenda-calendar-panel").setAttribute("aria-label", t.calendar);
}
function setupRooms() {
  const filters = $("room-filters"), select = $("reservation-room");
  for (const room of ROOMS) {
    const label = node("label", "agenda-room-filter"); roomStyle(label, room.id);
    const input = node("input"); input.type = "checkbox"; input.checked = true;
    input.value = room.id; input.id = `filter-${room.id}`;
    input.addEventListener("change", () => {
      if (input.checked) state.rooms.add(room.id); else state.rooms.delete(room.id);
      render();
    });
    label.append(input, node("span", "", roomLabel(room.id, lang))); filters.append(label);
    const option = node("option", "", roomLabel(room.id, lang)); option.value = room.id; select.append(option);
  }
}
function renderMini() {
  $("mini-month").textContent = monthText(state.miniDay);
  $("date-picker").value = state.day;
  const mini = $("mini-calendar"); mini.replaceChildren();
  const days = monthDays(state.miniDay), today = parisDate();
  for (const day of days.slice(0, 7)) mini.append(node("span", "", weekday(day, "narrow")));
  for (const day of days) {
    const b = button("", String(Number(day.slice(8))), () => selectDay(day), formatDate(day, lang));
    b.classList.toggle("is-outside", day.slice(0, 7) !== state.miniDay.slice(0, 7));
    b.classList.toggle("is-today", day === today);
    b.classList.toggle("is-selected", day === state.day);
    b.setAttribute("aria-pressed", String(day === state.day)); mini.append(b);
  }
}
function selectDay(day, view = state.view) {
  try { addDays(day, 0); } catch { return; }
  state.day = day; state.miniDay = day; state.view = view; render();
}
function periodDays() {
  if (state.view === "week") {
    const monday = startOfWeek(state.day);
    return Array.from({ length: state.weekends ? 7 : 5 }, (_, i) => addDays(monday, i));
  }
  if (state.view === "month") return monthDays(state.day);
  if (state.view === "list") return Array.from({ length: 30 }, (_, i) => addDays(state.day, i));
  return [state.day];
}
function filteredBookings() {
  const query = state.search.trim().toLocaleLowerCase(lang);
  return state.bookings.filter(b => state.rooms.has(b.room) && (!query || `${b.title} ${b.people} ${roomLabel(b.room, lang)}`.toLocaleLowerCase(lang).includes(query)));
}
function periodHeading(days) {
  if (state.view === "month") return monthText(state.day);
  if (state.view === "week") {
    const a = days[0], b = days.at(-1);
    return a.slice(0, 7) === b.slice(0, 7)
      ? `${Number(a.slice(8))}–${Number(b.slice(8))} ${formatDate(b, lang, { day: undefined, month: "long", year: "numeric" })}`
      : `${shortDate(a)} – ${shortDate(b)} ${b.slice(0, 4)}`;
  }
  if (state.view === "list") return `${shortDate(days[0])} – ${shortDate(days.at(-1))}`;
  return formatDate(state.day, lang, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}
function render() {
  if (!state.client) return;
  renderMini();
  document.querySelectorAll("[data-view]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.view === state.view)));
  const days = periodDays(), filtered = filteredBookings();
  $("period-heading").textContent = periodHeading(days);
  const visibleIds = new Set(days.flatMap(day => eventsForDay(filtered, day).map(b => b.id)));
  $("reservation-count").textContent = t.count(visibleIds.size);
  const calendar = $("calendar"); calendar.replaceChildren();
  $("outside-hours").hidden = true;
  if (!state.rooms.size) { renderEmpty(calendar, t.noRooms); return; }
  if (state.view === "month") renderMonth(calendar, days, filtered);
  else if (state.view === "list") renderList(calendar, days, filtered);
  else renderTime(calendar, days, filtered);
}
function renderEmpty(container, text) {
  const message = node("div", "agenda-empty"); message.append(node("span", "", "▦"), node("p", "", text)); container.append(message);
}
function navigate(direction) {
  let day;
  if (state.view === "month") day = moveMonth(state.day, direction);
  else day = addDays(state.day, direction * (state.view === "week" ? 7 : state.view === "list" ? 30 : 1));
  selectDay(day);
}
function eventButton(booking, day, className = "agenda-event") {
  const title = booking.title || booking.people;
  const el = button(className, "", (event) => {
    event.stopPropagation();
    if (Date.now() < state.suppressClickUntil || state.busy) return;
    openEditor(booking);
  }, `${title}, ${booking.people}, ${roomLabel(booking.room, lang)}, ${eventTime(booking, day)}`);
  roomStyle(el, booking.room);
  el.title = `${title}\n${booking.people}\n${roomLabel(booking.room, lang)}\n${eventTime(booking, day)}\n${t.moveHint}`;
  el.dataset.booking = booking.id;
  return el;
}
function eventContents(el, booking, day, showRoom = true) {
  el.append(node("span", "event-time", eventTime(booking, day)), node("span", "event-title", booking.title || booking.people));
  if (booking.title) el.append(node("span", "event-person", booking.people));
  if (showRoom) el.append(node("span", "event-room", roomLabel(booking.room, lang)));
}
function renderMonth(container, days, bookings) {
  const grid = node("div", "agenda-month-grid"), today = parisDate();
  for (const day of days.slice(0, 7)) grid.append(node("div", "agenda-month-weekday", weekday(day)));
  for (const day of days) {
    const cell = node("div", "agenda-month-cell");
    cell.classList.toggle("is-outside", day.slice(0, 7) !== state.day.slice(0, 7));
    cell.classList.toggle("is-today", day === today);
    cell.addEventListener("click", (event) => { if (event.target === cell && !state.busy) openEditor(null, { day, minute: 9 * 60 }); });
    cell.append(button("agenda-month-date", String(Number(day.slice(8))), (event) => { event.stopPropagation(); selectDay(day, "day"); }, `${t.viewDay}: ${formatDate(day, lang)}`));
    const events = eventsForDay(bookings, day).sort((a, b) => a.start.localeCompare(b.start));
    for (const b of events.slice(0, 4)) {
      const el = eventButton(b, day, "agenda-month-event");
      el.textContent = `${timeText(segmentForDay(b, day).startMinutes)} ${b.title || b.people}`; cell.append(el);
    }
    if (events.length > 4) cell.append(button("agenda-month-more", t.more(events.length - 4), (event) => { event.stopPropagation(); selectDay(day, "day"); }));
    grid.append(cell);
  }
  container.append(grid);
}
function renderList(container, days, bookings) {
  const list = node("div", "agenda-list"); let count = 0;
  for (const day of days) {
    const events = eventsForDay(bookings, day).sort((a, b) => a.start.localeCompare(b.start));
    if (!events.length) continue;
    count += events.length;
    const section = node("section", "agenda-list-day"), heading = node("div", "agenda-list-day-heading");
    heading.append(node("strong", "", shortDate(day)), node("span", "", weekday(day, "long")));
    const content = node("div");
    for (const booking of events) {
      const el = eventButton(booking, day, "agenda-list-booking"), description = node("span");
      description.append(node("span", "event-title", booking.title || booking.people));
      if (booking.title) description.append(node("span", "event-person", booking.people));
      el.append(node("span", "event-time", eventTime(booking, day)), description, node("span", "event-room", roomLabel(booking.room, lang))); content.append(el);
    }
    section.append(heading, content); list.append(section);
  }
  if (!count) renderEmpty(container, state.search ? t.emptySearch : t.emptyList); else container.append(list);
}
function laneLayout(rows) {
  const sorted = rows.sort((a, b) => a.start - b.start || b.end - a.end);
  let active = [], group = [], maximum = 1;
  function finish() { for (const row of group) row.lanes = maximum; group = []; maximum = 1; }
  for (const row of sorted) {
    active = active.filter(x => x.end > row.start);
    if (!active.length && group.length) finish();
    const occupied = new Set(active.map(x => x.lane)); let lane = 0;
    while (occupied.has(lane)) lane++;
    row.lane = lane; active.push(row); group.push(row); maximum = Math.max(maximum, lane + 1);
  }
  finish(); return sorted;
}
function renderTime(container, days, bookings) {
  const from = state.fullDay ? 0 : 480, until = state.fullDay ? 1440 : 1200;
  const hourHeight = Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--agenda-hour")) || 64;
  const height = (until - from) / 60 * hourHeight;
  const columns = state.view === "rooms"
    ? ROOMS.filter(r => state.rooms.has(r.id)).map(room => ({ day: state.day, room: room.id }))
    : days.map(day => ({ day, room: null }));
  const shell = node("div", "agenda-time-shell"), grid = node("div", "agenda-time-grid");
  grid.style.setProperty("--columns", String(columns.length)); grid.dataset.view = state.view;
  grid.append(node("div", "agenda-time-head agenda-gutter-head", "Paris"));
  const today = parisDate(), outside = new Set();
  for (const { day, room } of columns) {
    const head = room ? node("div", "agenda-time-head agenda-room-head") : button("agenda-time-head", "", () => selectDay(day, "day"), `${t.viewDay}: ${formatDate(day, lang)}`);
    if (room) { roomStyle(head, room); head.append(node("span", "", roomLabel(room, lang)), node("span", "room-date", shortDate(day))); }
    else head.append(node("span", "weekday", weekday(day)), node("span", "day-number", String(Number(day.slice(8)))));
    head.classList.toggle("is-today", day === today); head.classList.toggle("is-selected", day === state.day); grid.append(head);
  }
  const gutter = node("div", "agenda-time-gutter"); gutter.style.height = `${height}px`;
  for (let minute = from; minute < until; minute += 60) {
    const label = node("span", "agenda-hour-label", timeText(minute)); label.style.setProperty("--top", `${(minute - from) / 60 * hourHeight}px`); gutter.append(label);
  }
  grid.append(gutter);
  for (const { day, room } of columns) {
    const col = node("div", "agenda-time-column"); col.style.height = `${height}px`;
    col.classList.toggle("is-today", day === today);
    col.classList.toggle("is-weekend", weekdayNumber(day) >= 5);
    for (let minute = from; minute < until; minute += 30) {
      const slot = button("agenda-slot", "", () => { if (!state.busy) openEditor(null, { day, minute, room }); }, t.timeslot(timeText(minute), formatDate(day, lang)));
      slot.tabIndex = -1;
      slot.style.top = `${(minute - from) / 60 * hourHeight}px`;
      slot.addEventListener("click", (event) => event.stopPropagation()); col.append(slot);
    }
    col.addEventListener("click", (event) => {
      if (event.target !== col || state.busy) return;
      const minute = from + Math.floor((event.clientY - col.getBoundingClientRect().top) / hourHeight * 4) * 15;
      openEditor(null, { day, minute: Math.min(until - 15, Math.max(from, minute)), room });
    });
    installDrop(col, day, room, from, until, hourHeight);
    const rows = [];
    for (const b of eventsForDay(bookings, day).filter(b => !room || b.room === room)) {
      const segment = segmentForDay(b, day);
      if (segment.startMinutes < from || segment.endMinutes > until) outside.add(b.id);
      const start = Math.max(from, segment.startMinutes), end = Math.min(until, segment.endMinutes);
      if (end > start) rows.push({ booking: b, segment, start, end });
    }
    for (const row of laneLayout(rows)) {
      const { booking, segment, start, end, lane, lanes } = row;
      const el = eventButton(booking, day); eventContents(el, booking, day, !room);
      const eventHeight = Math.max(19, (end - start) / 60 * hourHeight - 2);
      el.style.top = `${(start - from) / 60 * hourHeight + 1}px`;
      el.style.height = `${eventHeight}px`; el.style.left = `calc(${lane / lanes * 100}% + 3px)`;
      el.style.width = `calc(${100 / lanes}% - 6px)`;
      el.classList.toggle("is-short", eventHeight < 37);
      installDrag(el, booking);
      if (!segment.continuesAfter && segment.endMinutes <= until) installResize(el, booking, day, from, until, hourHeight, col);
      col.append(el);
    }
    if (day === today) {
      const minute = minuteNow();
      if (minute >= from && minute < until) { const line = node("div", "agenda-now-line"); line.style.top = `${(minute - from) / 60 * hourHeight}px`; col.append(line); }
    }
    grid.append(col);
  }
  shell.append(grid); container.append(shell);
  if (outside.size && !state.fullDay) { $("outside-hours-text").textContent = t.outsideHours(outside.size); $("outside-hours").hidden = false; }
}
function weekdayNumber(day) { return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; }
function installDrag(el, booking) {
  el.draggable = true;
  el.addEventListener("dragstart", (event) => {
    if (state.busy) { event.preventDefault(); return; }
    state.dragged = booking.id; el.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "csd-room-reservation");
  });
  el.addEventListener("dragend", () => {
    state.dragged = null; el.classList.remove("is-dragging");
    document.querySelectorAll(".is-drop-target").forEach(col => col.classList.remove("is-drop-target"));
  });
}
function installDrop(col, day, room, from, until, hourHeight) {
  col.addEventListener("dragover", event => {
    if (!state.dragged || state.busy) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move"; col.classList.add("is-drop-target");
  });
  col.addEventListener("dragleave", event => { if (!col.contains(event.relatedTarget)) col.classList.remove("is-drop-target"); });
  col.addEventListener("drop", event => {
    if (!state.dragged || state.busy) return;
    event.preventDefault(); col.classList.remove("is-drop-target");
    const booking = state.bookings.find(b => b.id === state.dragged); state.dragged = null;
    if (!booking) return;
    const minute = Math.min(until - 15, Math.max(from, from + Math.floor((event.clientY - col.getBoundingClientRect().top) / hourHeight * 4) * 15));
    try {
      const start = isoAt(day, minute), duration = Date.parse(booking.end) - Date.parse(booking.start);
      const input = { ...booking, room: room || booking.room, start, end: new Date(Date.parse(start) + duration).toISOString() };
      if (input.start === booking.start && input.room === booking.room) return;
      void saveMovement(booking, input);
    } catch (error) { notice(errorText(error), true); }
  });
}
function installResize(el, booking, day, from, until, hourHeight, column) {
  const handle = node("span", "agenda-resize-handle"); handle.setAttribute("aria-hidden", "true"); handle.title = t.resizeHint;
  handle.addEventListener("click", event => event.stopPropagation());
  handle.addEventListener("pointerdown", event => {
    if (state.busy || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); handle.setPointerCapture(event.pointerId);
    const originalHeight = el.style.height, top = Number.parseFloat(el.style.top);
    let endMinute = segmentForDay(booking, day).endMinutes;
    const update = move => {
      endMinute = Math.min(until, Math.max(from + 15, from + Math.round((move.clientY - column.getBoundingClientRect().top) / hourHeight * 4) * 15));
      const pixels = (endMinute - from) / 60 * hourHeight - top - 1;
      el.style.height = `${Math.max(19, pixels)}px`;
    };
    const cleanup = () => { handle.removeEventListener("pointermove", update); handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", cancel); };
    const cancel = () => { cleanup(); el.style.height = originalHeight; state.suppressClickUntil = Date.now() + 300; };
    const finish = () => {
      cleanup(); state.suppressClickUntil = Date.now() + 300; el.style.height = originalHeight;
      try { const end = isoAt(day, endMinute); if (end !== booking.end) void saveMovement(booking, { ...booking, end }); }
      catch (error) { notice(errorText(error), true); }
    };
    handle.addEventListener("pointermove", update); handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", cancel);
  });
  el.append(handle);
}
async function saveMovement(booking, raw) {
  if (!state.client || state.busy) return;
  let input;
  try { input = validateReservationInput(raw); assertNoOverlap(input, state.bookings, booking.id); }
  catch (error) { notice(errorText(error), true); return; }
  const client = state.client, generation = state.generation;
  state.dataGeneration++;
  setBusy(true); notice(t.dragSaving);
  try {
    const result = await client.update(booking.id, booking.revision, input);
    if (!isCurrent(client, generation)) return;
    state.bookings = result.bookings; render(); stampRefresh(); notice(t.moved);
  } catch (error) {
    if (!isCurrent(client, generation)) return;
    if (error.code === "expired") { lock(t.expired); return; }
    if (error.code === "conflict" || error.code === "overlap") await refresh(false);
    if (isCurrent(client, generation)) notice(errorText(error), true);
  } finally { if (isCurrent(client, generation)) setBusy(false); }
}
function openEditor(booking = null, prefill = {}) {
  if (!state.client || state.busy) return;
  clearForm(); state.editing = booking ? { ...booking } : null;
  $("dialog-title").textContent = booking ? t.editReservation : t.newReservation;
  $("delete-reservation").hidden = !booking;
  $("save-reservation").disabled = false; $("delete-reservation").disabled = false;
  if (booking) {
    $("reservation-room").value = booking.room; $("reservation-start").value = toParisInput(booking.start);
    $("reservation-end").value = toParisInput(booking.end); $("reservation-people").value = booking.people; $("reservation-title").value = booking.title;
  } else {
    const day = prefill.day || state.day;
    const minute = prefill.minute ?? (day === parisDate() ? Math.min(1380, Math.max(540, Math.ceil(minuteNow() / 30) * 30)) : 540);
    $("reservation-room").value = prefill.room || [...state.rooms][0] || ROOMS[0].id;
    $("reservation-start").value = localInput(day, minute); $("reservation-end").value = localInput(day, minute + 60);
  }
  updateDuration();
  if (!$("reservation-dialog").open) $("reservation-dialog").showModal();
  requestAnimationFrame(() => $(booking ? "reservation-room" : "reservation-people").focus());
}
function updateDuration() {
  try {
    const minutes = (Date.parse(parisInputToISO($("reservation-end").value)) - Date.parse(parisInputToISO($("reservation-start").value))) / 60000;
    $("reservation-duration").textContent = minutes > 0 ? (minutes % 60 ? t.minutes(minutes) : t.hours(minutes / 60)) : "";
  } catch { $("reservation-duration").textContent = ""; }
}
function formInput() {
  const input = validateReservationInput({
    room: $("reservation-room").value, title: $("reservation-title").value,
    people: $("reservation-people").value, start: parisInputToISO($("reservation-start").value),
    end: parisInputToISO($("reservation-end").value),
  });
  assertNoOverlap(input, state.bookings, state.editing?.id); return input;
}
async function mutation(kind) {
  if (!state.client || state.busy) return;
  let input;
  if (kind !== "remove") {
    try { input = formInput(); } catch (error) { notice(errorText(error), true, "dialog-status"); return; }
  }
  const client = state.client, generation = state.generation, editing = state.editing;
  if (kind === "remove" && !editing) return;
  state.dataGeneration++;
  setBusy(true); $("delete-confirmation").hidden = true;
  notice(kind === "remove" ? t.removing : t.saving, false, "dialog-status");
  try {
    const result = kind === "remove" ? await client.remove(editing.id, editing.revision)
      : editing ? await client.update(editing.id, editing.revision, input) : await client.create(input);
    if (!isCurrent(client, generation)) return;
    state.bookings = result.bookings;
    $("reservation-dialog").close(); clearForm(); render(); stampRefresh();
    notice(kind === "remove" ? t.removed : editing ? t.updated : t.created);
  } catch (error) {
    if (!isCurrent(client, generation)) return;
    if (error.code === "expired" || error.code === "invalid-data") { lock(errorText(error)); return; }
    if (error.code === "conflict" || error.code === "overlap") await refresh(false);
    if (isCurrent(client, generation)) {
      notice(errorText(error), true, "dialog-status");
      if (editing && error.code === "conflict") {
        const current = state.bookings.find(b => b.id === editing.id);
        if (!current || current.revision !== editing.revision) {
          $("dialog-summary").hidden = false;
          $("dialog-summary").textContent = lang === "fr" ? "Fermez ce formulaire et ouvrez la réservation actualisée pour poursuivre." : "Close this form and open the updated reservation to continue.";
          $("dialog-summary").dataset.stale = "true";
        }
      }
    }
  } finally {
    if (isCurrent(client, generation)) {
      setBusy(false);
      if ($("dialog-summary").dataset.stale === "true") { $("save-reservation").disabled = true; $("delete-reservation").disabled = true; }
    }
  }
}
function stampRefresh() {
  const clock = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { timeZone: PARIS_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  $("last-refreshed").textContent = `${t.refreshed} ${clock}`;
}
async function refresh(announce = true) {
  if (!state.client || state.refreshing) return;
  const client = state.client, generation = state.generation;
  const dataGeneration = state.dataGeneration;
  state.refreshing = true; $("refresh-button").disabled = true;
  if (announce) notice(t.loading);
  try {
    const result = await client.read();
    if (!isCurrent(client, generation) || dataGeneration !== state.dataGeneration) return;
    state.bookings = result.bookings; render(); stampRefresh();
    if (announce) notice("");
  } catch (error) {
    if (!isCurrent(client, generation)) return;
    if (error.code === "expired" || error.code === "invalid-data") lock(errorText(error));
    else notice(errorText(error), true);
  } finally {
    state.refreshing = false;
    if (isCurrent(client, generation)) $("refresh-button").disabled = state.busy;
  }
}
async function unlock(event) {
  event.preventDefault();
  if (!isConfiguredAccess(state.envelope) || state.client) return;
  let password = $("agenda-password").value;
  $("agenda-password").value = ""; $("agenda-password").disabled = true; $("unlock-button").disabled = true;
  $("access-status").textContent = t.unlocking;
  const generation = ++state.generation; let client;
  try {
    const opening = openBookingSession(state.envelope, password); password = "";
    client = await opening;
    const result = await client.read();
    if (generation !== state.generation) { client.close(); return; }
    state.client = client; state.bookings = result.bookings; state.expiry = Date.now() + sessionLimit;
    $("access-panel").hidden = true; $("agenda-panel").hidden = false;
    notice(""); render(); stampRefresh();
    sessionTimer = setTimeout(() => lock(t.expired), sessionLimit);
    refreshTimer = setInterval(() => { if (!document.hidden && !state.busy && state.client) void refresh(false); }, 60000);
    $("new-reservation").focus();
  } catch (error) {
    client?.close(); password = "";
    if (generation !== state.generation) return;
    $("access-status").textContent = errorText(error);
    $("agenda-password").disabled = false; $("unlock-button").disabled = false; $("agenda-password").focus();
  }
}
async function loadAccess() {
  try {
    const url = new URL("../../data/booking-access.json", import.meta.url);
    if (window.CSD_CONFIG?.assetVersion) url.searchParams.set("v", window.CSD_CONFIG.assetVersion);
    const response = await fetch(url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("unavailable");
    state.envelope = await response.json();
    const configured = isConfiguredAccess(state.envelope);
    $("agenda-password").disabled = !configured; $("unlock-button").disabled = !configured;
    $("access-status").textContent = configured ? t.accessReady : t.accessUnavailable;
  } catch { $("access-status").textContent = t.accessUnavailable; }
}

setupLanguage();
if (window.top !== window.self) {
  $("agenda-password").value = "";
  $("access-form").replaceChildren();
  $("access-status").textContent = lang === "fr"
    ? "Ouvrez l’agenda directement dans votre navigateur pour accéder aux réservations."
    : "Open the agenda directly in your browser to access reservations.";
} else {
setupRooms();
$("access-form").addEventListener("submit", event => void unlock(event));
$("lock-button").addEventListener("click", () => lock());
$("refresh-button").addEventListener("click", () => { if (!state.busy) void refresh(); });
$("new-reservation").addEventListener("click", () => openEditor());
$("today-button").addEventListener("click", () => selectDay(parisDate()));
$("previous-button").addEventListener("click", () => navigate(-1));
$("next-button").addEventListener("click", () => navigate(1));
$("mini-prev").addEventListener("click", () => { state.miniDay = moveMonth(state.miniDay, -1); renderMini(); });
$("mini-next").addEventListener("click", () => { state.miniDay = moveMonth(state.miniDay, 1); renderMini(); });
$("date-picker").addEventListener("change", () => { if ($("date-picker").value) selectDay($("date-picker").value); });
document.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", () => {
  state.view = el.dataset.view; render();
}));
$("all-rooms").addEventListener("click", () => {
  state.rooms = new Set(ROOMS.map(r => r.id));
  $("room-filters").querySelectorAll("input").forEach(input => { input.checked = true; }); render();
});
$("show-weekends").addEventListener("change", () => { state.weekends = $("show-weekends").checked; render(); });
$("full-day").addEventListener("change", () => { state.fullDay = $("full-day").checked; render(); });
$("reveal-all-hours").addEventListener("click", () => { state.fullDay = true; $("full-day").checked = true; render(); });
$("agenda-search").addEventListener("input", () => { state.search = $("agenda-search").value; render(); });
$("close-dialog").addEventListener("click", closeEditor); $("cancel-dialog").addEventListener("click", closeEditor);
$("reservation-dialog").addEventListener("cancel", event => { if (state.busy) event.preventDefault(); else clearForm(); });
$("reservation-dialog").addEventListener("click", event => {
  const rect = $("reservation-dialog").getBoundingClientRect();
  if (event.target === $("reservation-dialog") && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeEditor();
});
$("reservation-form").addEventListener("submit", event => { event.preventDefault(); void mutation("save"); });
$("delete-reservation").addEventListener("click", () => { $("delete-confirmation").hidden = false; $("confirm-delete").focus(); });
$("cancel-delete").addEventListener("click", () => { $("delete-confirmation").hidden = true; $("delete-reservation").focus(); });
$("confirm-delete").addEventListener("click", () => void mutation("remove"));
$("reservation-start").addEventListener("input", updateDuration); $("reservation-end").addEventListener("input", updateDuration);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.client) {
    if (Date.now() >= state.expiry) lock(t.expired);
    else if (!state.busy) void refresh(false);
  }
});
window.addEventListener("pagehide", () => lock());
void loadAccess();
}
